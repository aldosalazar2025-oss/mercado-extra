-- MERCADO EXTRA · Etapa 15 · Panel administrativo
begin;

drop policy if exists requests_select_admin on public.requests;
create policy requests_select_admin on public.requests for select to authenticated using (public.is_admin());

create or replace function public.admin_resumen() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Solo la administración puede consultar el resumen.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from public.profiles),
    'identidades', (select count(*) from public.identity_verifications where status = 'pendiente'),
    'tiendas', (select count(*) from public.stores where status = 'pendiente'),
    'solicitudes', (select count(*) from public.requests where status in ('abierta', 'con_ofertas')),
    'pedidos', (select count(*) from public.orders where status not in ('completada', 'cancelada')),
    'reclamos', (select count(*) from public.claims where status in ('abierto', 'en_revision')),
    'cancelaciones', (select count(*) from public.cancellations where review_status = 'denunciada'),
    'calificaciones', (select count(*) from public.rating_reports where status = 'pendiente')
  );
end $$;

create or replace function public.admin_estado_usuario(p_id uuid, p_estado public.cuenta_estado, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_anterior public.cuenta_estado;
begin
  if not public.is_admin() then raise exception 'Solo la administración puede cambiar estados.' using errcode = '42501'; end if;
  if p_estado is null or coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 3000 then
    raise exception 'Escribe el motivo del cambio.';
  end if;
  select status into v_anterior from public.profiles where id = p_id and not is_admin for update;
  if not found then raise exception 'Solo se pueden cambiar estados de cuentas sin acceso administrativo.'; end if;
  if v_anterior = p_estado then raise exception 'La cuenta ya tiene ese estado.'; end if;
  update public.sanctions set ends_at = now()
    where user_id = p_id and source_type = 'otro' and source_id = p_id and ends_at is null;
  update public.profiles set status = p_estado where id = p_id;
  if p_estado <> 'activo' then
    insert into public.sanctions (user_id, type, reason, source_type, source_id, created_by)
    values (p_id, case when p_estado = 'bloqueado' then 'bloqueo' else 'suspension_temporal' end::public.sancion_tipo,
      btrim(p_motivo), 'otro', p_id, auth.uid());
  end if;
  perform public.registrar_auditoria('cambiar_estado_usuario', 'profiles', p_id::text,
    jsonb_build_object('anterior', v_anterior, 'nuevo', p_estado, 'motivo', btrim(p_motivo)));
end $$;

create or replace function public.admin_bloquear_suplantacion(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  estado_cuenta public.cuenta_estado;
  verificacion_id uuid;
  estado_identidad public.verificacion_estado;
  motivo text := btrim(p_motivo);
begin
  if not public.is_admin() or not public.cuenta_activa() then
    raise exception 'Se requiere acceso administrativo.' using errcode = '42501';
  end if;
  if coalesce(char_length(motivo), 0) not between 5 and 3000 then
    raise exception 'Escribe el motivo de la suplantación (entre 5 y 3000 caracteres).';
  end if;
  select status into estado_cuenta from public.profiles where id = p_id and not is_admin for update;
  if not found then raise exception 'Solo se pueden bloquear cuentas sin acceso administrativo completo.'; end if;

  select id, status into verificacion_id, estado_identidad
    from public.identity_verifications where user_id = p_id and status <> 'rechazado' for update;
  if not found then raise exception 'La cuenta no tiene una verificación pendiente o verificada que se pueda rechazar.'; end if;

  if estado_cuenta <> 'bloqueado' then
    perform public.admin_estado_usuario(p_id, 'bloqueado', motivo);
  end if;
  update public.identity_verifications
    set status = 'rechazado', rejection_reason = motivo, reviewed_by = auth.uid(), reviewed_at = now()
    where id = verificacion_id;

  perform public.registrar_auditoria('bloquear_por_suplantacion', 'profiles', p_id::text,
    jsonb_build_object('anterior', estado_cuenta, 'nuevo', 'bloqueado', 'verificacion_id', verificacion_id,
      'identidad_anterior', estado_identidad, 'identidad_nueva', 'rechazado', 'motivo', motivo));
end $$;

revoke execute on function public.admin_bloquear_suplantacion(uuid, text) from public, anon;
grant execute on function public.admin_bloquear_suplantacion(uuid, text) to authenticated;

create or replace function public.admin_resolver_denuncia_calificacion(p_id uuid, p_aceptar boolean, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rating uuid;
begin
  if not public.is_admin() then raise exception 'Solo la administración puede revisar denuncias.' using errcode = '42501'; end if;
  if p_aceptar is null or coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 3000 then
    raise exception 'Escribe el motivo de la decisión.';
  end if;
  update public.rating_reports set status = case when p_aceptar then 'aceptada' else 'rechazada' end
    where id = p_id and status = 'pendiente' returning rating_id into v_rating;
  if not found then raise exception 'La denuncia ya no está pendiente.'; end if;
  if p_aceptar then update public.ratings set status = 'oculta' where id = v_rating; end if;
  perform public.registrar_auditoria('resolver_denuncia_calificacion', 'rating_reports', p_id::text,
    jsonb_build_object('calificacion', v_rating, 'aceptada', p_aceptar, 'motivo', btrim(p_motivo)));
end $$;

revoke execute on function public.admin_resumen(),
  public.admin_estado_usuario(uuid, public.cuenta_estado, text),
  public.admin_resolver_denuncia_calificacion(uuid, boolean, text) from public, anon;
grant execute on function public.admin_resumen(),
  public.admin_estado_usuario(uuid, public.cuenta_estado, text),
  public.admin_resolver_denuncia_calificacion(uuid, boolean, text) to authenticated;

-- Las cuentas restringidas antes de esta corrección también pueden apelar.
insert into public.sanctions (user_id, type, reason, source_type, source_id)
select p.id, case when p.status = 'bloqueado' then 'bloqueo' else 'suspension_temporal' end::public.sancion_tipo,
  coalesce(a.metadata->>'motivo', 'Restricción aplicada por administración.'), 'otro', p.id
from public.profiles p
left join lateral (
  select metadata from public.audit_logs
  where action = 'cambiar_estado_usuario' and entity_id = p.id::text and metadata->>'nuevo' = p.status::text
  order by id desc limit 1
) a on true
where not p.is_admin and p.status in ('suspendido', 'bloqueado') and not exists (
  select 1 from public.sanctions s where s.user_id = p.id and s.source_type = 'otro' and s.source_id = p.id and s.ends_at is null
);

alter table public.profiles add column if not exists admin_baja_at timestamptz;
alter table public.stores add column if not exists admin_baja_at timestamptz;

create or replace function public.reactivar_por_apelacion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source_type = 'otro' and new.source_id = new.user_id and new.ends_at is null
    and new.appeal_status = 'aceptada' and old.appeal_status = 'pendiente' then
    update public.profiles set status = 'activo' where id = new.user_id and not is_admin and admin_baja_at is null
      and status = case when new.type = 'bloqueo' then 'bloqueado' else 'suspendido' end::public.cuenta_estado;
  end if;
  return new;
end $$;

drop trigger if exists reactivar_por_apelacion on public.sanctions;
create trigger reactivar_por_apelacion after update of appeal_status on public.sanctions
for each row execute function public.reactivar_por_apelacion();

create or replace function public.impedir_operaciones_cuenta_restringida() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.es_servicio() and not public.cuenta_activa() then
    raise exception 'Tu cuenta está suspendida o bloqueada.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare tabla text;
begin
  foreach tabla in array array['identity_verifications','stores','store_categories','store_photos','store_members',
    'products','product_images','product_tags','requests','request_images','request_matches','offers','offer_history',
    'orders','order_items','delivery_evidence','delivery_codes','messages','message_reads','notifications','ratings','rating_reports',
    'cancellations','claims','claim_responses','claim_evidence','promotions','subscriptions'] loop
    execute format('drop trigger if exists impedir_operaciones_cuenta_restringida on public.%I', tabla);
    execute format('create trigger impedir_operaciones_cuenta_restringida before insert or update or delete on public.%I
      for each row execute function public.impedir_operaciones_cuenta_restringida()', tabla);
  end loop;
end $$;

drop trigger if exists impedir_operaciones_cuenta_restringida on public.profiles;
create trigger impedir_operaciones_cuenta_restringida before update on public.profiles
for each row execute function public.impedir_operaciones_cuenta_restringida();

drop policy if exists cuenta_activa_storage on storage.objects;
create policy cuenta_activa_storage on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('public-catalog','identity-private','request-images','chat-private','delivery-evidence','claim-evidence','offer-images')
    or public.cuenta_activa())
  with check (bucket_id not in ('public-catalog','identity-private','request-images','chat-private','delivery-evidence','claim-evidence','offer-images')
    or public.cuenta_activa());

revoke execute on function public.reactivar_por_apelacion(), public.impedir_operaciones_cuenta_restringida()
from public, anon, authenticated;

-- Papelera administrativa. Solo admite registros terminales sin dependencias protegidas.
create or replace function public.admin_reglas_papelera()
returns table (tabla text, elegible text)
language sql immutable set search_path = public, pg_temp as $$
  values
    ('rating_reports', 'r.status in (''aceptada'', ''rechazada'')'),
    ('promotions', 'r.status::text in (''rechazada'', ''pausada'', ''vencida'') or (r.status = ''activa'' and r.ends_at <= now())'),
    ('subscriptions', 'r.status::text in (''cancelada'', ''vencida'') or (r.status = ''activa'' and r.ends_at <= now())'),
    ('subscription_plans', 'not r.active and not exists (select 1 from public.subscriptions s where s.plan_id = r.id)'),
    ('categories', 'not r.active
      and not exists (select 1 from public.categories c where c.parent_id = r.id)
      and not exists (select 1 from public.products p where p.category_id = r.id)
      and not exists (select 1 from public.store_categories s where s.category_id = r.id)
      and not exists (select 1 from public.requests q where q.category_id = r.id)'),
    ('claims', 'r.status in (''resuelto'', ''cerrado'') and r.resolution is distinct from ''sancion''
      and not exists (select 1 from public.claim_evidence e where e.claim_id = r.id)
      and not exists (select 1 from public.claim_returns d where d.claim_id = r.id)
      and not exists (select 1 from public.sanctions s where s.source_type = ''reclamo'' and s.source_id = r.id)'),
    ('cancellations', 'r.review_status = ''justificada'' and cardinality(r.evidence_paths) = 0
      and not exists (select 1 from public.sanctions s where s.source_type = ''cancelacion'' and s.source_id = r.id)'),
    ('sanctions', 'r.source_id is null and r.appeal_status is distinct from ''pendiente''
      and (r.revoked_at is not null or r.appeal_status = ''aceptada'' or r.ends_at <= now())'),
    ('requests', 'r.status in (''atendida'', ''vencida'', ''cancelada'', ''eliminada'') and r.selected_offer_id is null
      and not exists (select 1 from public.orders o where o.request_id = r.id)
      and not exists (select 1 from public.cancellations c where c.request_id = r.id)
      and not exists (select 1 from public.conversations c where c.request_id = r.id)
      and not exists (select 1 from public.offers o where o.request_id = r.id)
      and not exists (select 1 from public.request_images i where i.request_id = r.id)'),
    ('offers', 'r.status in (''rechazada'', ''reemplazada'', ''retirada'')
      and not exists (select 1 from public.orders o where o.request_id = r.request_id)
      and not exists (select 1 from public.requests q where q.selected_offer_id = r.id)
      and not exists (select 1 from public.conversations c where c.offer_id = r.id)
      and not exists (select 1 from public.offer_history h where h.offer_id = r.id)'),
    ('orders', 'r.status = ''cancelada''
      and not exists (select 1 from public.claims c where c.order_id = r.id)
      and not exists (select 1 from public.cancellations c where c.order_id = r.id)
      and not exists (select 1 from public.conversations c where c.order_id = r.id)
      and not exists (select 1 from public.ratings c where c.order_id = r.id)
      and not exists (select 1 from public.delivery_evidence e where e.order_id = r.id)')
$$;

do $$
declare regla record;
begin
  for regla in select * from public.admin_reglas_papelera() loop
    execute format('alter table public.%I add column if not exists admin_archived_at timestamptz', regla.tabla);
    execute format('create index if not exists %I on public.%I (admin_archived_at) where admin_archived_at is not null',
      regla.tabla || '_admin_archived_idx', regla.tabla);
    -- Las tablas con UPDATE directo requieren impedir que un cliente ajuste la fecha de purga.
    execute format('drop trigger if exists proteger_papelera_admin on public.%I', regla.tabla);
  end loop;
end $$;

create or replace function public.proteger_papelera_admin() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') and (
    (tg_op = 'INSERT' and new.admin_archived_at is not null)
    or (tg_op = 'UPDATE' and new.admin_archived_at is distinct from old.admin_archived_at)
  ) then
    raise exception 'La fecha de archivo se gestiona desde la papelera administrativa.' using errcode = '42501';
  end if;
  if tg_table_name in ('subscription_plans', 'categories') and new.admin_archived_at is not null
    and (to_jsonb(new)->>'active')::boolean then
    raise exception 'Recupera el registro desde Auditoría antes de activarlo.';
  end if;
  return new;
end $$;

do $$
declare regla record;
begin
  for regla in select * from public.admin_reglas_papelera() loop
    execute format('create trigger proteger_papelera_admin before insert or update on public.%I
      for each row execute function public.proteger_papelera_admin()', regla.tabla);
  end loop;
end $$;

create or replace function public.admin_cancelacion_archivable(p_id uuid)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cancellations c join public.sanctions s
      on s.source_type = 'cancelacion' and s.source_id = c.id
    where c.id = p_id and c.review_status = 'injustificada'
  )
$$;

-- El archivo administrativo conserva las negociaciones ligadas a una venta completada.
create or replace function public.admin_venta_archivable(p_solicitud uuid)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.orders where request_id = p_solicitud and status = 'completada')
    and not exists (
      select 1 from public.orders o where o.request_id = p_solicitud and (
        o.status <> 'completada' or exists (select 1 from public.claims c where c.order_id = o.id)
        or exists (select 1 from public.cancellations c where c.order_id = o.id)
      )
    )
    and not exists (select 1 from public.cancellations c where c.request_id = p_solicitud)
$$;

create or replace function public.admin_regla_archivo(p_tabla text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_tabla
    when 'cancellations' then 'public.admin_cancelacion_archivable(r.id)'
    when 'requests' then 'r.status = ''atendida'' and public.admin_venta_archivable(r.id)'
    when 'offers' then 'r.status in (''aceptada'', ''rechazada'', ''reemplazada'', ''retirada'')
      and public.admin_venta_archivable(r.request_id)'
    when 'orders' then 'r.status = ''completada'' and public.admin_venta_archivable(r.request_id)'
  end
$$;

create or replace function public.admin_archivar_ventas(p_tabla text, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare condicion text; cantidad integer;
begin
  if p_tabla is null or p_tabla not in ('requests', 'offers', 'orders') or not public.is_admin() then
    raise exception 'Se requiere acceso administrativo.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) not between 1 and 1000 then raise exception 'Selecciona entre 1 y 1000 registros.'; end if;
  condicion := public.admin_regla_archivo(p_tabla);
  execute format('update public.%I r set admin_archived_at = now()
    where r.id = any($1) and r.admin_archived_at is null and (%s)', p_tabla, condicion) using p_ids;
  get diagnostics cantidad = row_count;
  if cantidad > 0 then
    perform public.registrar_auditoria('archivar_resueltos', p_tabla, null, jsonb_build_object('cantidad', cantidad, 'modo', 'conservar_historial'));
  end if;
  return cantidad;
end $$;
revoke execute on function public.admin_venta_archivable(uuid), public.admin_regla_archivo(text),
  public.admin_archivar_ventas(text, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_archivar_ventas(text, uuid[]) to authenticated;

create or replace function public.admin_acciones_papelera(p_tabla text, p_ids uuid[])
returns table (id uuid, accion text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare condicion text;
begin
  if not public.is_admin() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  select elegible into condicion from public.admin_reglas_papelera() where tabla = p_tabla;
  if condicion is null then raise exception 'Esta sección no admite papelera.'; end if;
  return query execute format('select r.id, case when (%s) then ''eliminar''::text else ''archivar''::text end
    from public.%I r where r.id = any($1) and r.admin_archived_at is null and ((%s) or (%s))',
    condicion, p_tabla, condicion,
    coalesce(public.admin_regla_archivo(p_tabla), 'false'))
    using p_ids;
end $$;

create or replace function public.admin_archivar_cancelaciones(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare cantidad integer;
begin
  if not public.is_admin() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  if coalesce(cardinality(p_ids), 0) not between 1 and 1000 then raise exception 'Selecciona entre 1 y 1000 registros.'; end if;
  update public.cancellations c set admin_archived_at = now()
    where c.id = any(p_ids) and c.admin_archived_at is null and public.admin_cancelacion_archivable(c.id);
  get diagnostics cantidad = row_count;
  if cantidad > 0 then
    perform public.registrar_auditoria('archivar_cancelaciones_sancionadas', 'cancellations', null, jsonb_build_object('cantidad', cantidad));
  end if;
  return cantidad;
end $$;

create or replace function public.admin_enviar_papelera(p_tabla text, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare condicion text; cantidad integer;
begin
  if not public.is_admin() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  if coalesce(cardinality(p_ids), 0) not between 1 and 1000 then raise exception 'Selecciona entre 1 y 1000 registros.'; end if;
  select elegible into condicion from public.admin_reglas_papelera() where tabla = p_tabla;
  if condicion is null then raise exception 'Esta sección no admite papelera.'; end if;
  if to_regclass('cron.job') is null then raise exception 'El programador de purga todavía no está configurado.'; end if;
  if not exists (select 1 from cron.job where jobname = 'mercado-extra-purgar-papelera' and active) then
    raise exception 'El programador de purga no está activo.';
  end if;
  execute format('update public.%I r set admin_archived_at = now()
    where r.id = any($1) and r.admin_archived_at is null and (%s)', p_tabla, condicion) using p_ids;
  get diagnostics cantidad = row_count;
  if cantidad > 0 then
    perform public.registrar_auditoria('archivar_resueltos', p_tabla, null, jsonb_build_object('cantidad', cantidad));
  end if;
  return cantidad;
end $$;

-- Retira el acceso a la operación antigua que abarcaba toda la sección.
do $$
begin
  if to_regprocedure('public.admin_archivar_resueltos(text)') is not null then
    revoke execute on function public.admin_archivar_resueltos(text) from public, anon, authenticated;
  end if;
end $$;

create or replace function public.admin_eliminar_lista_filtrada(p_tabla text, p_estado text, p_apelacion text default null, p_busqueda text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare condicion text; ids uuid[]; cantidad integer := 0; lote integer;
begin
  if not public.is_admin() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  select elegible into condicion from public.admin_reglas_papelera()
    where tabla = p_tabla and tabla not in ('subscription_plans', 'categories');
  if condicion is null or nullif(btrim(p_estado), '') is null then
    raise exception 'Selecciona un estado para eliminar la lista.';
  end if;
  loop
    execute format('select array(select r.id from public.%I r cross join lateral (select to_jsonb(r) as d) f
      where r.admin_archived_at is null and (%s)
      and ($2 is null or f.d->>''appeal_status'' = $2)
      and ($4 is null or strpos(lower(f.d->>''title''), lower($4)) > 0)
      and case
        when $3 = ''sanctions'' then
          case when f.d->>''revoked_at'' is not null or f.d->>''appeal_status'' = ''aceptada'' then ''revocada''
            when (f.d->>''ends_at'')::timestamptz <= now() then ''vencida'' end
        when $3 in (''promotions'', ''subscriptions'') and f.d->>''status'' = ''activa''
          and (f.d->>''ends_at'')::timestamptz <= now() then ''vencida''
        else coalesce(f.d->>''status'', f.d->>''review_status'')
      end = $1 order by r.id limit 1000 for update)', p_tabla, condicion)
      into ids using p_estado, p_apelacion, p_tabla, nullif(btrim(p_busqueda), '');
    if cardinality(ids) = 0 then return cantidad; end if;
    lote := public.admin_enviar_papelera(p_tabla, ids);
    cantidad := cantidad + lote;
    if lote < cardinality(ids) then return cantidad; end if;
  end loop;
end $$;

drop function if exists public.admin_listar_papelera(text, integer);
create function public.admin_listar_papelera(p_tabla text, p_offset integer)
returns table (tabla text, id uuid, titulo text, archivado_en timestamptz, conservar boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare consulta text;
begin
  if not public.is_admin() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'Página no válida.'; end if;
  select string_agg(format(
    'select %L::text as tabla, r.id, coalesce(nullif(d.datos->>''name'', ''''), nullif(d.datos->>''title'', ''''),
      nullif(d.datos->>''description'', ''''), nullif(d.datos->>''reason'', ''''), nullif(d.datos->>''decision'', ''''),
      nullif(d.datos->>''reason_text'', ''''), r.id::text) as titulo, r.admin_archived_at as archivado_en,
      coalesce((%L = ''cancellations'' and d.datos->>''review_status'' = ''injustificada'')
        or (%L = ''orders'' and d.datos->>''status'' = ''completada'')
        or (%L in (''requests'', ''offers'') and not (%s)), false) as conservar
      from public.%I r cross join lateral (select to_jsonb(r) as datos) d where r.admin_archived_at is not null',
    regla.tabla, regla.tabla, regla.tabla, regla.tabla, regla.elegible, regla.tabla), ' union all ')
    into consulta from public.admin_reglas_papelera() regla where p_tabla is null or regla.tabla = p_tabla;
  if consulta is null then raise exception 'Esta sección no admite papelera.'; end if;
  return query execute 'select * from (' || consulta || ') p order by archivado_en desc, tabla, id limit 26 offset $1' using p_offset;
end $$;

create or replace function public.admin_recuperar_archivado(p_tabla text, p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare cantidad integer;
begin
  if not public.is_admin() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  if not exists (select 1 from public.admin_reglas_papelera() where tabla = p_tabla) then
    raise exception 'Esta sección no admite papelera.';
  end if;
  execute format('update public.%I set admin_archived_at = null where id = $1 and admin_archived_at is not null', p_tabla)
    using p_id;
  get diagnostics cantidad = row_count;
  if cantidad = 0 then raise exception 'El registro ya no está en la papelera.'; end if;
  perform public.registrar_auditoria('recuperar_archivado', p_tabla, p_id::text);
end $$;

create or replace function public.admin_purgar_papelera()
returns void language plpgsql set search_path = public, pg_temp as $$
declare regla record; registro record;
begin
  for regla in select * from public.admin_reglas_papelera() loop
    for registro in execute format('select r.id from public.%I r
      where r.admin_archived_at <= now() - interval ''360 hours'' and (%s)
      order by r.admin_archived_at for update skip locked limit 250', regla.tabla, regla.elegible) loop
      begin
        execute format('delete from public.%I r where r.id = $1
          and r.admin_archived_at <= now() - interval ''360 hours'' and (%s)', regla.tabla, regla.elegible) using registro.id;
      exception when foreign_key_violation then
        raise warning 'Se conserva %.% por una dependencia.', regla.tabla, registro.id;
      end;
    end loop;
  end loop;
end $$;

revoke execute on function public.admin_reglas_papelera(), public.proteger_papelera_admin(),
  public.admin_cancelacion_archivable(uuid), public.admin_acciones_papelera(text, uuid[]), public.admin_archivar_cancelaciones(uuid[]),
  public.admin_purgar_papelera(), public.admin_enviar_papelera(text, uuid[]),
  public.admin_eliminar_lista_filtrada(text, text, text, text),
  public.admin_listar_papelera(text, integer), public.admin_recuperar_archivado(text, uuid)
from public, anon, authenticated;
grant execute on function public.admin_enviar_papelera(text, uuid[]), public.admin_listar_papelera(text, integer),
  public.admin_acciones_papelera(text, uuid[]), public.admin_archivar_cancelaciones(uuid[]),
  public.admin_eliminar_lista_filtrada(text, text, text, text),
  public.admin_recuperar_archivado(text, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('mercado-extra-purgar-papelera', '*/15 * * * *', 'select public.admin_purgar_papelera()');
  end if;
end $$;

-- Las invitaciones delegadas nunca conceden el rol global de profiles.
create or replace function public.admin_modulos_delegables()
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select array['resumen','usuarios','identidad','tiendas','categorias','productos','solicitudes','ofertas',
    'operaciones','reclamos','cancelaciones','sanciones','promociones','planes','reputacion','auditoria']::text[]
$$;

create table if not exists public.admin_invitaciones (
  id uuid primary key default gen_random_uuid(),
  correo text not null unique,
  permisos text[] not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'revocada')),
  usuario_id uuid references public.profiles(id) on delete cascade,
  constraint admin_invitaciones_usuario_activo check (estado <> 'activa' or usuario_id is not null)
);
alter table public.admin_invitaciones drop constraint if exists admin_invitaciones_permisos_check;
alter table public.admin_invitaciones add constraint admin_invitaciones_permisos_check
  check (cardinality(permisos) > 0 and permisos <@ public.admin_modulos_delegables());
alter table public.admin_invitaciones enable row level security;
create unique index if not exists admin_invitaciones_usuario_idx on public.admin_invitaciones (usuario_id) where usuario_id is not null;
revoke all on public.admin_invitaciones from public, anon, authenticated;

create or replace function public.admin_equipo()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() or not public.cuenta_activa() then raise exception 'Acceso restringido.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'titulares', (select count(*) from public.profiles where is_admin and status = 'activo'),
    'invitaciones', coalesce((select jsonb_agg(to_jsonb(i) order by i.correo) from public.admin_invitaciones i), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_invitar(p_correo text, p_permisos text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare correo_invitado text := lower(btrim(p_correo)); invitacion uuid;
begin
  if not public.is_admin() or not public.cuenta_activa() then raise exception 'Acceso restringido.' using errcode = '42501'; end if;
  if correo_invitado is null or length(correo_invitado) > 254 or correo_invitado !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Escribe un correo válido.';
  end if;
  if exists (select 1 from public.profiles p where lower(p.email) = correo_invitado and p.is_admin) then
    raise exception 'Este correo ya tiene acceso administrativo completo.';
  end if;
  if coalesce(cardinality(p_permisos), 0) not between 1 and cardinality(public.admin_modulos_delegables())
    or exists (select 1 from unnest(p_permisos) a where a is null)
    or not (p_permisos <@ public.admin_modulos_delegables()) then
    raise exception 'Selecciona permisos válidos.';
  end if;
  insert into public.admin_invitaciones as i (correo, permisos)
    values (correo_invitado, array(select distinct unnest(p_permisos)))
    on conflict (correo) do update set permisos = excluded.permisos,
      estado = case when i.estado = 'activa' then 'activa' else 'pendiente' end,
      usuario_id = case when i.estado = 'activa' then i.usuario_id end
    returning id into invitacion;
  perform public.registrar_auditoria('guardar_invitacion_administrativa', 'admin_invitaciones', invitacion::text,
    jsonb_build_object('permisos', p_permisos));
end $$;

create or replace function public.admin_revocar_invitacion(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() or not public.cuenta_activa() then raise exception 'Acceso restringido.' using errcode = '42501'; end if;
  update public.admin_invitaciones set estado = 'revocada', usuario_id = null where id = p_id and estado <> 'revocada';
  if not found then raise exception 'La invitación ya no está vigente.'; end if;
  perform public.registrar_auditoria('revocar_invitacion_administrativa', 'admin_invitaciones', p_id::text);
end $$;

create or replace function public.mi_acceso_administrativo()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(i) - 'usuario_id'
  from public.admin_invitaciones i
  where public.cuenta_activa()
    and ((i.estado = 'pendiente' and i.correo = lower(auth.jwt()->>'email'))
      or (i.estado = 'activa' and i.usuario_id = auth.uid()))
  order by (i.estado = 'activa') desc
  limit 1
$$;

create or replace function public.aceptar_invitacion_admin(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.cuenta_activa() then raise exception 'Acceso restringido.' using errcode = '42501'; end if;
  update public.admin_invitaciones set estado = 'activa', usuario_id = auth.uid()
    where id = p_id and estado = 'pendiente' and correo = lower(auth.jwt()->>'email');
  if not found then raise exception 'La invitación no está disponible para esta cuenta.'; end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id)
    values (auth.uid(), 'aceptar_invitacion_administrativa', 'admin_invitaciones', p_id::text);
end $$;

drop function if exists public.admin_consultar_delegado(text, integer);
create function public.admin_consultar_delegado(p_seccion text, p_offset integer)
returns table (id text, titulo text, estado text, fecha timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare consulta text;
begin
  if not public.cuenta_activa() or not exists (
    select 1 from public.admin_invitaciones i
    where i.usuario_id = auth.uid() and i.estado = 'activa' and p_seccion = any(i.permisos)
  ) then raise exception 'Acceso restringido.' using errcode = '42501'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'Página no válida.'; end if;
  consulta := case p_seccion
    when 'resumen' then $resumen$
      values ('1', 'Usuarios registrados', (select count(*)::text from public.profiles), null::timestamptz),
        ('2', 'Identidades pendientes', (select count(*)::text from public.identity_verifications where status='pendiente'), null),
        ('3', 'Tiendas pendientes', (select count(*)::text from public.stores where status='pendiente'), null),
        ('4', 'Solicitudes abiertas o con ofertas', (select count(*)::text from public.requests where status in ('abierta','con_ofertas')), null),
        ('5', 'Pedidos en curso', (select count(*)::text from public.orders where status not in ('completada','cancelada')), null),
        ('6', 'Reclamos por resolver', (select count(*)::text from public.claims where status in ('abierto','en_revision')), null),
        ('7', 'Cancelaciones denunciadas', (select count(*)::text from public.cancellations where review_status='denunciada'), null),
        ('8', 'Denuncias de calificaciones pendientes', (select count(*)::text from public.rating_reports where status='pendiente'), null)
    $resumen$
    when 'usuarios' then 'select id, coalesce(nullif(full_name, ''''), ''Usuario''), status::text, created_at from public.profiles where admin_baja_at is null'
    when 'identidad' then 'select id, ''Verificación de identidad''::text, status::text, submitted_at from public.identity_verifications'
    when 'tiendas' then 'select id, name, status::text, created_at from public.stores where admin_baja_at is null'
    when 'categorias' then 'select id, name, case when active then ''activa'' else ''desactivada'' end, created_at from public.categories where admin_archived_at is null'
    when 'productos' then 'select id, name, case when admin_hidden then ''retirado'' else status::text end, created_at from public.products where status <> ''eliminado'''
    when 'solicitudes' then 'select id, title, status::text, created_at from public.requests where admin_archived_at is null'
    when 'ofertas' then 'select o.id, r.title, o.status::text, o.created_at from public.offers o join public.requests r on r.id=o.request_id where o.admin_archived_at is null'
    when 'operaciones' then 'select o.id, r.title, o.status::text, o.created_at from public.orders o join public.requests r on r.id=o.request_id where o.admin_archived_at is null'
    when 'reclamos' then 'select id, type::text, status::text, created_at from public.claims where admin_archived_at is null'
    when 'cancelaciones' then 'select id, reason_code::text, review_status::text, created_at from public.cancellations where admin_archived_at is null'
    when 'sanciones' then 'select id, type::text, case when revoked_at is not null or appeal_status = ''aceptada'' then ''revocada''
      when ends_at <= now() then ''vencida'' when starts_at > now() then ''programada'' else ''activa'' end, created_at
      from public.sanctions where admin_archived_at is null'
    when 'promociones' then 'select id, ''Promoción''::text, case when status = ''activa'' and ends_at <= now() then ''vencida'' else status::text end,
      created_at from public.promotions where admin_archived_at is null'
    when 'planes' then 'select id, name, case when active then ''disponible'' else ''desactivado'' end, null::timestamptz
      from public.subscription_plans where admin_archived_at is null'
    when 'reputacion' then 'select id, ''Denuncia de calificación''::text, status::text, created_at from public.rating_reports where admin_archived_at is null'
    when 'auditoria' then 'select id, action, entity, created_at from public.audit_logs'
  end;
  if consulta is null then raise exception 'Sección no disponible.'; end if;
  return query execute 'select r.id::text, r.titulo, r.estado, r.fecha from (' || consulta ||
    ') r(id,titulo,estado,fecha) order by r.fecha desc nulls last, r.id limit 21 offset $1' using p_offset;
end $$;

revoke execute on function public.admin_equipo(), public.admin_invitar(text, text[]), public.admin_revocar_invitacion(uuid),
  public.admin_modulos_delegables(),
  public.mi_acceso_administrativo(), public.aceptar_invitacion_admin(uuid), public.admin_consultar_delegado(text, integer)
from public, anon, authenticated;
grant execute on function public.admin_equipo(), public.admin_invitar(text, text[]), public.admin_revocar_invitacion(uuid),
  public.mi_acceso_administrativo(), public.aceptar_invitacion_admin(uuid), public.admin_consultar_delegado(text, integer)
to authenticated;

-- Visibilidad personal del historial del comprador.
create table if not exists public.comprador_ocultos (
  usuario uuid not null references public.profiles(id) on delete cascade,
  seccion text not null,
  registro uuid not null,
  primary key (usuario, seccion, registro)
);
alter table public.comprador_ocultos enable row level security;
revoke all on public.comprador_ocultos from public, anon, authenticated;
grant select on public.comprador_ocultos to authenticated;
drop policy if exists comprador_ocultos_propios on public.comprador_ocultos;
create policy comprador_ocultos_propios on public.comprador_ocultos for select to authenticated using (usuario = auth.uid());

-- El listado y el tacho comparten la misma regla de elegibilidad.
create or replace function public.pedidos_ocultables(p_seccion text, p_ids uuid[])
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select o.id from public.orders o
  where o.id = any(p_ids) and public.cuenta_activa()
    and not exists (select 1 from public.order_close_control a where a.order_id=o.id and a.reporte='pendiente')
    and ((p_seccion = 'compras' and o.buyer_id = auth.uid())
      or (p_seccion = 'pedidos_tienda' and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos'))))
    and (o.status in ('completada','cancelada') or exists (
      select 1 from public.claims c where c.order_id = o.id and c.status in ('resuelto','cerrado')
    ))
    and not exists (
      select 1 from public.claims c left join public.claim_returns d on d.claim_id = c.id
      where c.order_id = o.id and (
        c.status in ('abierto','en_revision')
        or d.estado not in ('recibida','cerrada','confirmada')
        or (d.claim_id is null and c.resolution in ('intercambio','acuerdo_partes','sancion'))
      )
    )
$$;
revoke all on function public.pedidos_ocultables(text,uuid[]) from public, anon;
grant execute on function public.pedidos_ocultables(text,uuid[]) to authenticated;

create or replace function public.ocultar_historial_comprador(p_seccion text, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare usuario_actual uuid := auth.uid(); consulta text; cantidad integer;
begin
  if usuario_actual is null or not public.cuenta_activa() then
    raise exception 'Se requiere una cuenta activa.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) not between 1 and 1000 then raise exception 'Selecciona entre 1 y 1000 registros.'; end if;
  consulta := case p_seccion
    when 'solicitudes' then 'select id from public.requests where buyer_id=$1 and status in (''atendida'',''vencida'',''cancelada'')'
    when 'bandeja_ofertas' then 'select r.id from public.requests r where r.buyer_id=$1 and exists (select 1 from public.offers o where o.request_id=r.id)'
    when 'ofertas' then 'select o.id from public.offers o join public.requests r on r.id=o.request_id where r.buyer_id=$1 and o.id not in (select public.ofertas_tienda_con_reclamo($3))'
    when 'compras' then 'select public.pedidos_ocultables($2,$3) as id'
    when 'pedidos_tienda' then 'select public.pedidos_ocultables($2,$3) as id'
    when 'ofertas_tienda' then 'select f.id from public.offers f
      where f.id = any($3) and f.store_id in (select public.tiendas_con_permiso(''enviar_ofertas''))
        and f.id not in (select public.ofertas_tienda_con_reclamo($3))'
    when 'chat_tienda' then 'select id from public.conversations
      where store_id in (select public.tiendas_con_permiso(''chat''))'
    when 'chat' then 'select id from public.conversations where buyer_id=$1'
    when 'reclamo' then 'select id from public.claims where buyer_id=$1 and status in (''resuelto'',''cerrado'')
      and not exists (select 1 from public.claim_returns d where d.claim_id=claims.id and d.estado not in (''recibida'',''cerrada'',''confirmada''))'
    when 'reclamos_tienda' then 'select c.id from public.claims c where c.buyer_id<>$1
      and public.tienda_gestiona_devolucion(c.store_id) and c.status in (''resuelto'',''cerrado'')
      and not exists (select 1 from public.claim_returns d where d.claim_id=c.id and d.estado not in (''recibida'',''cerrada'',''confirmada''))'
    when 'cancelacion' then 'select c.id from public.cancellations c left join public.orders o on o.id=c.order_id
      left join public.requests r on r.id=c.request_id where coalesce(o.buyer_id,r.buyer_id)=$1 and c.review_status in (''justificada'',''injustificada'')'
    when 'sancion' then 'select id from public.sanctions where user_id=$1 and store_id is null
      and (revoked_at is not null or appeal_status=''aceptada'' or ends_at<=now())'
    when 'calificaciones' then 'select id from public.ratings where (rater_id=$1 and rater_role=''comprador'')
      or (rated_id=$1 and rater_role=''vendedor'')'
  end;
  if consulta is null then raise exception 'Sección no válida.'; end if;
  execute 'insert into public.comprador_ocultos(usuario,seccion,registro)
    select $1,$2,x.id from (' || consulta || ') x where x.id=any($3) on conflict do nothing'
    using usuario_actual, p_seccion, p_ids;
  get diagnostics cantidad = row_count;

  if p_seccion in ('compras', 'pedidos_tienda') then
    with finalizados as (
      select p.id, p.request_id, p.store_id from public.orders p
      where p.status = 'completada' and p.id in (select public.pedidos_ocultables(p_seccion, p_ids))
    ), vinculados as (
      select 'solicitudes' as seccion, request_id as registro from finalizados where p_seccion = 'compras'
      union all
      select 'bandeja_ofertas', request_id from finalizados where p_seccion = 'compras'
      union all
      select case when p_seccion = 'compras' then 'ofertas' else 'ofertas_tienda' end, f.id
      from finalizados p join public.offers f on f.request_id = p.request_id
        and (p_seccion = 'compras' or f.store_id = p.store_id)
      where f.id not in (select public.ofertas_tienda_con_reclamo(array[f.id]))
      union all
      select case when p_seccion = 'compras' then 'chat' else 'chat_tienda' end, c.id
      from finalizados p join public.conversations c on c.request_id = p.request_id
        and (p_seccion = 'compras' or c.store_id = p.store_id)
    )
    insert into public.comprador_ocultos(usuario, seccion, registro)
    select usuario_actual, seccion, registro from vinculados on conflict do nothing;
  end if;
  return cantidad;
end $$;

revoke execute on function public.ocultar_historial_comprador(text, uuid[]) from public, anon;
grant execute on function public.ocultar_historial_comprador(text, uuid[]) to authenticated;

commit;

-- Resúmenes por lote para los listados del administrador titular.
create or replace function public.admin_promedios_listado(p_seccion text, p_ids uuid[])
returns table (id uuid, promedio numeric, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() or not public.cuenta_activa() then
    raise exception 'Se requiere acceso administrativo.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) > 1000 then raise exception 'Demasiados registros.'; end if;
  if p_seccion = 'usuarios' then
    return query select r.rated_id, round(avg(r.score), 2), count(*)
    from public.ratings r
    where r.rated_id = any(p_ids) and r.rater_role = 'vendedor' and r.status = 'visible'
    group by r.rated_id;
  elsif p_seccion = 'tiendas' then
    return query select o.store_id, round(avg(r.score), 2), count(*)
    from public.orders o join public.ratings r on r.order_id = o.id
    where o.store_id = any(p_ids) and r.rater_role = 'comprador' and r.status = 'visible'
    group by o.store_id;
  else
    raise exception 'Sección no válida.';
  end if;
end $$;
revoke all on function public.admin_promedios_listado(text, uuid[]) from public, anon;
grant execute on function public.admin_promedios_listado(text, uuid[]) to authenticated;

-- La baja conserva las claves y los registros de operación.
create or replace function public.proteger_baja_administrativa()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.admin_baja_at is not null and
    (new.admin_baja_at is distinct from old.admin_baja_at or new.status is distinct from old.status) then
    raise exception 'El registro está dado de baja.';
  end if;
  if new.admin_baja_at is distinct from old.admin_baja_at and current_user in ('anon', 'authenticated') then
    raise exception 'La baja se registra mediante el panel administrativo.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists proteger_baja_administrativa on public.profiles;
create trigger proteger_baja_administrativa before update on public.profiles
for each row execute function public.proteger_baja_administrativa();
drop trigger if exists proteger_baja_administrativa on public.stores;
create trigger proteger_baja_administrativa before update on public.stores
for each row execute function public.proteger_baja_administrativa();

create or replace function public.admin_dar_baja_usuario(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare anterior public.cuenta_estado;
begin
  if not public.is_admin() or not public.cuenta_activa() then
    raise exception 'Se requiere acceso administrativo.' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 3000 then raise exception 'Escribe el motivo de la baja.'; end if;
  select p.status into anterior from public.profiles p
    where p.id = p_id and not p.is_admin and p.admin_baja_at is null for update;
  if not found then raise exception 'La cuenta ya fue dada de baja o está protegida.'; end if;
  if exists (select 1 from public.admin_invitaciones where usuario_id = p_id and estado = 'activa') then
    raise exception 'Revoca primero el acceso administrativo delegado de esta cuenta.';
  end if;

  update auth.users set email = null, email_change = '', banned_until = 'infinity'
    where id = p_id;
  delete from auth.sessions where user_id = p_id;
  delete from auth.identities where user_id = p_id;

  update public.identity_verifications set status = 'rechazado', rejection_reason = 'Cuenta dada de baja.',
    reviewed_by = auth.uid(), reviewed_at = now() where user_id = p_id and status <> 'rechazado';
  update public.profiles set status = 'bloqueado', email = null, admin_baja_at = now() where id = p_id;
  perform public.registrar_auditoria('dar_baja_usuario', 'profiles', p_id::text,
    jsonb_build_object('anterior', anterior, 'nuevo', 'baja', 'motivo', btrim(p_motivo)));
end $$;

create or replace function public.admin_dar_baja_tienda(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare anterior public.tienda_estado;
begin
  if not public.is_admin() or not public.cuenta_activa() then
    raise exception 'Se requiere acceso administrativo.' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 3000 then raise exception 'Escribe el motivo de la baja.'; end if;
  select s.status into anterior from public.stores s where s.id = p_id and s.admin_baja_at is null for update;
  if not found then raise exception 'La tienda ya fue dada de baja o no existe.'; end if;
  update public.stores set status = 'inactiva', business_id = null, rejection_reason = btrim(p_motivo),
    admin_baja_at = now() where id = p_id;
  perform public.registrar_auditoria('dar_baja_tienda', 'stores', p_id::text,
    jsonb_build_object('anterior', anterior, 'nuevo', 'baja', 'motivo', btrim(p_motivo)));
end $$;
revoke all on function public.admin_dar_baja_usuario(uuid, text), public.admin_dar_baja_tienda(uuid, text) from public, anon;
grant execute on function public.admin_dar_baja_usuario(uuid, text), public.admin_dar_baja_tienda(uuid, text) to authenticated;

-- Abrir el chat desde la oferta recupera la visibilidad personal de la conversación.
create or replace function public.restaurar_chat_desde_oferta(p_oferta uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare conversacion uuid;
begin
  select c.id into conversacion
  from public.conversations c
  join public.offers o on o.id = c.offer_id and o.store_id = c.store_id
  where o.id = p_oferta and c.store_id in (select public.tiendas_con_permiso('chat'))
  order by c.created_at desc, c.id desc limit 1;
  if conversacion is null then
    raise exception 'No hay un chat disponible para esta oferta o no tienes permiso.' using errcode = '42501';
  end if;
  delete from public.comprador_ocultos
  where usuario = auth.uid() and seccion = 'chat_tienda' and registro = conversacion;
  return conversacion;
end $$;
revoke all on function public.restaurar_chat_desde_oferta(uuid) from public, anon;
grant execute on function public.restaurar_chat_desde_oferta(uuid) to authenticated;
