-- MERCADO EXTRA · Etapa 14 · Reclamos, cancelaciones y sanciones

begin;

alter table public.sanctions add column if not exists store_id uuid references public.stores(id) on delete restrict;
alter table public.sanctions add column if not exists revoked_at timestamptz;
alter table public.sanctions add column if not exists revoked_by uuid references public.profiles(id) on delete set null;
alter table public.sanctions add column if not exists revocation_reason text
  check (char_length(btrim(revocation_reason)) between 5 and 3000);
create index if not exists sanctions_store_id_idx on public.sanctions (store_id) where store_id is not null;

create or replace function public.cuenta_activa() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'activo')
    and not exists (
      select 1 from public.sanctions s where s.user_id = auth.uid()
        and s.store_id is null
        and s.revoked_at is null
        and s.type in ('suspension_temporal', 'bloqueo')
        and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
        and s.appeal_status is distinct from 'aceptada'
    )
$$;

-- El panel administrativo usa esta marca para conservar las tiendas dadas de baja.
alter table public.stores add column if not exists admin_baja_at timestamptz;

create or replace function public.tiendas_con_permiso(perm text, solo_aprobadas boolean default false)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id
  from public.stores s
  where public.cuenta_activa()
    and s.admin_baja_at is null and s.status <> 'suspendida'
    and (not solo_aprobadas or s.status = 'aprobada')
    and not exists (
      select 1 from public.sanctions a where a.store_id = s.id
        and a.revoked_at is null
        and a.type in ('suspension_temporal', 'bloqueo')
        and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
        and a.appeal_status is distinct from 'aceptada'
    )
    and (
      s.owner_id = auth.uid()
      or exists (
        select 1 from public.store_members m
        where m.store_id = s.id and m.user_id = auth.uid() and m.status = 'activo'
          and (
            perm = any (m.extra_permissions)
            or exists (select 1 from public.role_permissions rp where rp.role_code = m.role_code and rp.permission_code = perm)
          )
      )
    )
$$;

alter policy sanctions_select on public.sanctions using (
  user_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
);

create or replace function public.avisos_sanciones_vigentes()
returns table (id uuid, tipo public.sancion_tipo, vence timestamptz, tienda text)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.type, a.ends_at, s.name
  from public.sanctions a left join public.stores s on s.id = a.store_id
  where auth.uid() is not null and a.revoked_at is null
    and a.appeal_status is distinct from 'aceptada'
    and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
    and ((a.store_id is null and a.user_id = auth.uid()) or s.owner_id = auth.uid()
      or exists (select 1 from public.store_members m
        where m.store_id = a.store_id and m.user_id = auth.uid() and m.status = 'activo'))
  order by a.starts_at desc
$$;

revoke execute on function public.avisos_sanciones_vigentes() from public, anon;
grant execute on function public.avisos_sanciones_vigentes() to authenticated;

revoke insert on public.cancellations from authenticated;

-- Etapa 14: la cancelación corresponde al pedido creado al aceptar una oferta.
drop trigger if exists trg_requests_registrar_cancelacion on public.requests;
drop function if exists public.registrar_cancelacion_solicitud();

create or replace function public.impedir_cancelacion_solicitud() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'La cancelación se realiza desde el pedido después de aceptar una oferta.';
end $$;

drop trigger if exists trg_requests_impedir_cancelacion on public.requests;
create trigger trg_requests_impedir_cancelacion before update of status on public.requests
for each row when (new.status = 'cancelada' and old.status is distinct from new.status)
execute function public.impedir_cancelacion_solicitud();

revoke execute on function public.impedir_cancelacion_solicitud() from public, anon, authenticated;

create or replace function public.cancelar_operacion(p_id uuid, p_es_pedido boolean, p_motivo public.cancelacion_motivo, p_detalle text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_orden public.orders%rowtype;
begin
  if p_es_pedido is distinct from true then
    raise exception 'La cancelación se realiza desde el pedido después de aceptar una oferta.';
  end if;
  if not public.cuenta_activa() or coalesce(char_length(btrim(p_detalle)), 0) not between 5 and 3000 then
    raise exception 'Indica un motivo de entre 5 y 3000 caracteres desde una cuenta activa.';
  end if;

  select * into v_orden from public.orders where id = p_id for update;
  if not found or (v_orden.buyer_id <> auth.uid()
      and v_orden.store_id not in (select public.tiendas_con_permiso('gestionar_pedidos')))
      or v_orden.status not in ('oferta_aceptada', 'compra_coordinada', 'en_preparacion', 'evidencias_registradas') then
    raise exception 'Solo una parte del pedido puede cancelarlo antes de que se marque como enviado o listo para recojo.';
  end if;

  insert into public.cancellations (order_id, cancelled_by, reason_code, reason_text)
    values (p_id, auth.uid(), p_motivo, btrim(p_detalle));
  update public.orders set status = 'cancelada' where id = p_id;
  insert into public.delivery_events (order_id, event, from_status, to_status, actor_id)
    values (p_id, 'estado', v_orden.status, 'cancelada', auth.uid());
end $$;

create or replace function public.es_contraparte_cancelacion(p_cancelacion uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cancellations c
    left join public.orders o on o.id = c.order_id
    where c.id = p_cancelacion and c.cancelled_by <> auth.uid() and (
      (o.buyer_id = c.cancelled_by and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos')))
      or (o.buyer_id <> c.cancelled_by and o.buyer_id = auth.uid())
      or (c.order_id is null and exists (
        select 1 from public.offers f where f.request_id = c.request_id and f.status = 'enviada'
          and f.store_id in (select public.tiendas_con_permiso('enviar_ofertas'))
      ))
    )
  )
$$;

alter policy cancellations_select on public.cancellations using (
  cancelled_by = auth.uid() or public.is_admin() or public.es_contraparte_cancelacion(id)
  or (order_id is not null and public.puede_ver_pedido(order_id))
  or exists (select 1 from public.requests r where r.id = request_id and r.buyer_id = auth.uid())
);

alter table public.cancellations add column if not exists report_text text check (char_length(report_text) between 5 and 3000);
alter table public.cancellations add column if not exists response_text text check (char_length(response_text) between 5 and 3000);
alter table public.cancellations add column if not exists review_note text;
alter table public.claims add column if not exists resolution_note text;

create or replace function public.responder_cancelacion(p_id uuid, p_texto text, p_denuncia boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(char_length(btrim(p_texto)), 0) not between 5 and 3000 then
    raise exception 'Escribe entre 5 y 3000 caracteres.';
  end if;
  if p_denuncia then
    update public.cancellations
      set review_status = 'denunciada', reported_by = auth.uid(), report_text = btrim(p_texto)
      where id = p_id and review_status = 'sin_revision' and public.es_contraparte_cancelacion(id);
  else
    update public.cancellations set response_text = btrim(p_texto)
      where id = p_id and review_status = 'denunciada' and cancelled_by = auth.uid() and response_text is null;
  end if;
  if not found then raise exception 'Esta acción ya no está disponible para ti.'; end if;
end $$;

create or replace function public.revisar_cancelacion(p_id uuid, p_justificada boolean, p_nota text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() or p_justificada is null or coalesce(char_length(btrim(p_nota)), 0) not between 5 and 3000 then
    raise exception 'Se requiere acceso administrativo y una explicación.';
  end if;
  update public.cancellations
    set review_status = case when p_justificada then 'justificada' else 'injustificada' end::public.cancelacion_revision,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_nota)
    where id = p_id and review_status = 'denunciada';
  if not found then raise exception 'La cancelación no está pendiente de revisión.'; end if;
  perform public.registrar_auditoria('revisar_cancelacion', 'cancellations', p_id::text);
end $$;

create or replace function public.revisar_reclamo(p_id uuid, p_resolucion public.reclamo_resolucion, p_nota text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() or (p_resolucion is not null and coalesce(char_length(btrim(p_nota)), 0) not between 5 and 3000) then
    raise exception 'Se requiere acceso administrativo y una explicación para resolver.';
  end if;
  update public.claims
    set status = case when p_resolucion is null then 'en_revision'
      when p_resolucion = 'cerrado_sin_incumplimiento' then 'cerrado' else 'resuelto' end::public.reclamo_estado,
      resolution = p_resolucion, resolution_note = case when p_resolucion is not null then btrim(p_nota) end,
      resolved_by = case when p_resolucion is not null then auth.uid() end,
      resolved_at = case when p_resolucion is not null then now() end
    where id = p_id and (status = 'abierto' or (status = 'en_revision' and p_resolucion is not null));
  if not found then raise exception 'El reclamo ya fue cerrado o ya está en revisión.'; end if;
  perform public.registrar_auditoria('revisar_reclamo', 'claims', p_id::text);
end $$;

create or replace function public.aplicar_sancion(p_id uuid, p_origen text, p_tipo public.sancion_tipo, p_dias integer, p_motivo text, p_horas integer)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_usuario uuid;
  v_tienda uuid;
  v_propietario uuid;
  v_origen text := p_origen;
begin
  if not public.is_admin() or p_tipo is null or coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 3000
      or (p_tipo = 'advertencia' and coalesce(p_dias, 0) not between 1 and 365)
      or (p_tipo = 'suspension_temporal' and (
        coalesce(p_dias, -1) not between 0 and 365 or coalesce(p_horas, -1) not between 0 and 23
        or coalesce(p_dias::bigint * 24 + p_horas, 0) not between 1 and 8760
      )) then
    raise exception 'Se requiere acceso administrativo, motivo y una duración válida para suspensiones.';
  end if;
  if p_origen = 'cancelacion' then
    select coalesce(s.owner_id, c.cancelled_by), s.id
      into v_usuario, v_tienda
      from public.cancellations c left join public.orders o on o.id = c.order_id
      left join public.stores s on s.id = o.store_id and c.cancelled_by <> o.buyer_id
      where c.id = p_id and c.review_status = 'injustificada' for update of c;
  elsif p_origen = 'reclamo' then
    select s.owner_id, s.id into v_usuario, v_tienda from public.claims c join public.stores s on s.id = c.store_id
      where c.id = p_id and c.status = 'resuelto' and c.resolution = 'sancion' for update of c;
  elsif p_origen = 'usuario' then
    v_origen := 'otro';
    select id into v_usuario from public.profiles where id = p_id and id <> auth.uid() for update;
  elsif p_origen = 'tienda' then
    v_origen := 'otro';
    select owner_id, id into v_usuario, v_tienda from public.stores where id = p_id for update;
  end if;
  if v_usuario is null or (v_origen <> 'otro' and exists (
    select 1 from public.sanctions where source_id = p_id and source_type = v_origen
  )) then
    raise exception 'El caso no admite una nueva sanción.';
  end if;
  insert into public.sanctions (user_id, store_id, type, reason, source_type, source_id, ends_at, created_by)
    values (v_usuario, v_tienda, p_tipo, btrim(p_motivo), v_origen, case when v_origen <> 'otro' then p_id end,
      case p_tipo
        when 'advertencia' then now() + make_interval(hours => p_dias * 24)
        when 'suspension_temporal' then now() + make_interval(hours => p_dias * 24 + p_horas)
      end, auth.uid());
  insert into public.notifications (user_id, type, title, body)
    values (v_usuario, 'sancion', case when v_tienda is null then 'Se registró una sanción en tu cuenta'
      else 'Se registró una sanción relacionada con tu tienda' end, btrim(p_motivo));
  if v_tienda is not null then
    select owner_id into v_propietario from public.stores where id = v_tienda;
    if v_propietario <> v_usuario then
      insert into public.notifications (user_id, type, title, body)
        values (v_propietario, 'sancion', 'Se registró una sanción para tu tienda', btrim(p_motivo));
    end if;
  end if;
  perform public.registrar_auditoria('aplicar_sancion', p_origen, p_id::text);
end $$;

revoke execute on function public.aplicar_sancion(uuid, text, public.sancion_tipo, integer, text, integer) from public, anon;
grant execute on function public.aplicar_sancion(uuid, text, public.sancion_tipo, integer, text, integer) to authenticated;

create or replace function public.aplicar_sancion(p_id uuid, p_origen text, p_tipo public.sancion_tipo, p_dias integer, p_motivo text)
returns void language sql set search_path = public, pg_temp as $$
  select public.aplicar_sancion(p_id, p_origen, p_tipo, p_dias, p_motivo, 0)
$$;

create or replace function public.apelar_sancion(p_id uuid, p_texto text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(char_length(btrim(p_texto)), 0) not between 5 and 3000 then raise exception 'Escribe entre 5 y 3000 caracteres.'; end if;
  update public.sanctions set appeal_text = btrim(p_texto), appeal_status = 'pendiente'
    where id = p_id and revoked_at is null and appeal_status is null and (
      user_id = auth.uid() or exists (
        select 1 from public.stores s where s.id = sanctions.store_id and s.owner_id = auth.uid()
      )
    );
  if not found then raise exception 'Esta sanción no se puede apelar.'; end if;
end $$;

create or replace function public.revisar_apelacion(p_id uuid, p_aceptada boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() or p_aceptada is null then raise exception 'Se requiere acceso administrativo.'; end if;
  update public.sanctions set appeal_status = case when p_aceptada then 'aceptada' else 'rechazada' end
    where id = p_id and revoked_at is null and appeal_status = 'pendiente';
  if not found then raise exception 'La apelación no está pendiente.'; end if;
  perform public.registrar_auditoria('revisar_apelacion', 'sanctions', p_id::text);
end $$;

create or replace function public.revocar_sancion(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sancion public.sanctions%rowtype;
begin
  if not public.is_admin() or coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 3000 then
    raise exception 'Se requiere acceso administrativo y un motivo de revocación de 5 a 3000 caracteres.';
  end if;
  update public.sanctions
    set revoked_at = now(), revoked_by = auth.uid(), revocation_reason = btrim(p_motivo)
    where id = p_id and revoked_at is null and appeal_status is distinct from 'aceptada'
      and starts_at <= now() and (ends_at is null or ends_at > now())
    returning * into v_sancion;
  if not found then raise exception 'La sanción ya no está activa.'; end if;
  insert into public.notifications (user_id, type, title, body)
    values (v_sancion.user_id, 'sancion',
      case when v_sancion.store_id is null then 'Se revocó una sanción de tu cuenta'
        else 'Se revocó una sanción de tu tienda' end, v_sancion.revocation_reason);
  perform public.registrar_auditoria('revocar_sancion', 'sanctions', p_id::text);
end $$;

revoke execute on function public.revocar_sancion(uuid, text) from public, anon;
grant execute on function public.revocar_sancion(uuid, text) to authenticated;

-- RLS permite a las partes seguir el caso. Las transiciones se hacen por RPC.
revoke update on public.claims, public.cancellations, public.sanctions from authenticated;
revoke insert, delete on public.sanctions from authenticated;

alter policy claim_responses_insert on public.claim_responses with check (
  author_id = auth.uid() and not is_appeal
  and exists (
    select 1 from public.claims c
    where c.id = claim_id and c.buyer_id <> auth.uid()
      and c.status in ('abierto', 'en_revision')
      and c.store_id in (select public.tiendas_con_permiso('gestionar_pedidos'))
  )
);

alter policy claim_evidence_insert on public.claim_evidence with check (
  author_id = auth.uid() and public.puede_ver_reclamo(claim_id)
  and split_part(file_path, '/', 1) = claim_id::text
  and exists (select 1 from public.claims c where c.id = claim_id and c.status in ('abierto', 'en_revision'))
);

revoke execute on function public.cancelar_operacion(uuid, boolean, public.cancelacion_motivo, text),
  public.es_contraparte_cancelacion(uuid), public.responder_cancelacion(uuid, text, boolean),
  public.revisar_cancelacion(uuid, boolean, text), public.revisar_reclamo(uuid, public.reclamo_resolucion, text),
  public.aplicar_sancion(uuid, text, public.sancion_tipo, integer, text), public.apelar_sancion(uuid, text),
  public.revisar_apelacion(uuid, boolean) from public, anon;
grant execute on function public.cancelar_operacion(uuid, boolean, public.cancelacion_motivo, text),
  public.es_contraparte_cancelacion(uuid), public.responder_cancelacion(uuid, text, boolean),
  public.revisar_cancelacion(uuid, boolean, text), public.revisar_reclamo(uuid, public.reclamo_resolucion, text),
  public.aplicar_sancion(uuid, text, public.sancion_tipo, integer, text), public.apelar_sancion(uuid, text),
  public.revisar_apelacion(uuid, boolean) to authenticated;

create or replace function public.puede_adjuntar_cancelacion(p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cancellations c where c.id = p_id
      and c.review_status in ('sin_revision', 'denunciada')
      and (c.cancelled_by = auth.uid() or public.es_contraparte_cancelacion(c.id))
  )
$$;

alter policy reclamo_subir on storage.objects with check (
  bucket_id = 'claim-evidence' and (
    exists (select 1 from public.claims c
      where c.id = public.try_uuid((storage.foldername(name))[1]) and c.status in ('abierto', 'en_revision'))
    or ((storage.foldername(name))[1] = 'cancelaciones'
      and (storage.foldername(name))[3] = auth.uid()::text
      and public.puede_adjuntar_cancelacion(public.try_uuid((storage.foldername(name))[2])))
  )
);
alter policy reclamo_leer on storage.objects using (
  bucket_id = 'claim-evidence' and (
    public.puede_ver_reclamo(public.try_uuid((storage.foldername(name))[1]))
    or ((storage.foldername(name))[1] = 'cancelaciones' and exists (
      select 1 from public.cancellations c where c.id = public.try_uuid((storage.foldername(name))[2])
    ))
  )
);

create or replace function public.adjuntar_cancelacion(p_id uuid, p_ruta text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if split_part(p_ruta, '/', 1) <> 'cancelaciones' or split_part(p_ruta, '/', 2) <> p_id::text
    or split_part(p_ruta, '/', 3) <> auth.uid()::text
    or not exists (select 1 from storage.objects where bucket_id = 'claim-evidence' and name = p_ruta) then
    raise exception 'Archivo no válido.';
  end if;
  update public.cancellations
    set evidence_paths = array_append(evidence_paths, p_ruta)
    where id = p_id and review_status in ('sin_revision', 'denunciada')
      and public.puede_adjuntar_cancelacion(id) and not p_ruta = any(evidence_paths);
  if not found then raise exception 'Ya no se puede adjuntar esta evidencia.'; end if;
end $$;

revoke execute on function public.puede_adjuntar_cancelacion(uuid), public.adjuntar_cancelacion(uuid, text) from public, anon;
grant execute on function public.puede_adjuntar_cancelacion(uuid), public.adjuntar_cancelacion(uuid, text) to authenticated;

-- El pedido conserva la constancia aunque el caso salga del historial administrativo.
create table if not exists public.pedidos_con_reclamo (
  order_id uuid primary key references public.orders(id) on delete cascade
);
alter table public.pedidos_con_reclamo enable row level security;
revoke all on public.pedidos_con_reclamo from public, anon, authenticated;
insert into public.pedidos_con_reclamo(order_id)
  select distinct order_id from public.claims on conflict do nothing;

create or replace function public.pedido_tiene_reclamo(p_pedido uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.pedidos_con_reclamo r join public.orders o on o.id = r.order_id
    where o.id = p_pedido and o.buyer_id = auth.uid()
  )
$$;
revoke all on function public.pedido_tiene_reclamo(uuid) from public, anon;
grant execute on function public.pedido_tiene_reclamo(uuid) to authenticated;

create or replace function public.validar_nuevo_reclamo() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.orders o where o.id = new.order_id and o.buyer_id = new.buyer_id
    and o.store_id = new.store_id and o.status in ('enviado_o_listo', 'pendiente_confirmacion', 'entregado')
    for update;
  if not found then raise exception 'El pedido no admite reclamos nuevos.'; end if;
  insert into public.pedidos_con_reclamo(order_id) values (new.order_id) on conflict do nothing;
  if not found then
    raise exception 'Ya presentaste un reclamo para este pedido.' using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists trg_claims_validar on public.claims;
create trigger trg_claims_validar before insert on public.claims
for each row execute function public.validar_nuevo_reclamo();
revoke execute on function public.validar_nuevo_reclamo() from public, anon, authenticated;

alter policy claims_insert on public.claims with check (
  buyer_id = auth.uid() and status = 'abierto' and public.cuenta_activa()
  and resolution is null and resolution_note is null and resolved_by is null and resolved_at is null
  and exists (
    select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid() and o.store_id = claims.store_id
      and o.status in ('enviado_o_listo', 'pendiente_confirmacion', 'entregado')
  )
);
alter policy requests_update on public.requests using (buyer_id = auth.uid() and public.cuenta_activa())
  with check (buyer_id = auth.uid() and public.cuenta_activa());

create or replace function public.contexto_pedido_reclamo(p_order uuid)
returns table (
  solicitud text, tienda text, precio numeric, oferta text, condiciones text, tiempo text,
  conversacion uuid, evidencias text[]
)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.title, s.name, o.agreed_price, h.description, h.delivery_terms, h.eta,
    (select c.id from public.conversations c where c.order_id = o.id limit 1),
    array(select e.file_path from public.delivery_evidence e where e.order_id = o.id order by e.uploaded_at)
  from public.orders o
  join public.requests r on r.id = o.request_id
  join public.stores s on s.id = o.store_id
  join public.offer_history h on h.id = o.offer_version_id
  where o.id = p_order and public.is_admin()
    and (exists (select 1 from public.claims c where c.order_id = o.id)
         or exists (select 1 from public.cancellations c where c.order_id = o.id and c.review_status <> 'sin_revision'))
$$;

revoke execute on function public.contexto_pedido_reclamo(uuid) from public, anon;
grant execute on function public.contexto_pedido_reclamo(uuid) to authenticated;

-- La revisión administrativa concede acceso temporal solo a adjuntos del hilo auditado.
create or replace function public.registrar_auditoria(p_action text, p_entity text, p_entity_id text default null, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.es_servicio() or public.is_admin()) or p_action = 'admin_leer_chat' then
    raise exception 'Acción de auditoría no disponible para registro manual' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;

create or replace function public.admin_puede_ver_foto_chat(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() and exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.conversation_id = public.try_uuid(split_part(p_path, '/', 1)) and m.image_path = p_path
      and (exists (select 1 from public.claims r where r.order_id = c.order_id)
        or exists (select 1 from public.cancellations x where x.order_id = c.order_id and x.review_status <> 'sin_revision'))
      and exists (
        select 1 from public.audit_logs a
        where a.actor_id = auth.uid() and a.action = 'admin_leer_chat' and a.entity = 'conversations'
          and a.entity_id = c.id::text and a.created_at > now() - interval '15 minutes'
          and a.created_at >= m.created_at
      )
  )
$$;

revoke execute on function public.admin_puede_ver_foto_chat(text) from public, anon;
grant execute on function public.admin_puede_ver_foto_chat(text) to authenticated;

alter policy chat_img_leer on storage.objects using (
  bucket_id = 'chat-private' and (
    public.can_access_conversation(public.try_uuid((storage.foldername(name))[1]))
    or public.admin_puede_ver_foto_chat(name)
  )
);

commit;

-- Devolución vinculada al reclamo. Los cambios pasan por una sola transición auditada.
create table if not exists public.claim_returns (
  claim_id uuid primary key references public.claims(id),
  estado text not null check (estado in ('ordenada','enviada','en_revision','recibida','cerrada')),
  instrucciones text not null,
  evidencia text,
  nota text,
  actualizado_en timestamptz not null default now()
);
alter table public.claim_returns add column if not exists modalidad text not null default 'devolucion';
alter table public.claim_returns add column if not exists evidencia_tienda text;
alter table public.claim_returns add column if not exists estado_previo text;
alter table public.claim_returns drop constraint if exists claim_returns_modalidad_check;
alter table public.claim_returns add constraint claim_returns_modalidad_check check (modalidad in ('devolucion','intercambio','compra'));
alter table public.claim_returns drop constraint if exists claim_returns_estado_check;
alter table public.claim_returns add constraint claim_returns_estado_check
  check (estado in ('ordenada','enviada','en_revision','recibida','cerrada','por_cumplir','por_confirmar','confirmada'));
alter table public.claim_returns enable row level security;
revoke all on public.claim_returns from public, anon, authenticated;
grant select on public.claim_returns to authenticated;

-- Una sanción comercial no impide que la tienda termine una devolución.
create or replace function public.tienda_gestiona_devolucion(p_tienda uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.cuenta_activa() and exists (
    select 1 from public.stores s where s.id = p_tienda and s.admin_baja_at is null and (
      s.owner_id = auth.uid() or exists (
        select 1 from public.store_members m where m.store_id = s.id and m.user_id = auth.uid()
          and m.status = 'activo' and ('gestionar_pedidos' = any(m.extra_permissions) or exists (
            select 1 from public.role_permissions p where p.role_code = m.role_code and p.permission_code = 'gestionar_pedidos'
          ))
      )
    )
  )
$$;

create or replace function public.puede_ver_reclamo(cid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.claims c where c.id = cid and (
      c.buyer_id = auth.uid() or c.store_id in (select public.tiendas_con_permiso('gestionar_pedidos'))
      or (exists (select 1 from public.claim_returns d where d.claim_id = cid) and public.tienda_gestiona_devolucion(c.store_id))
    )
  )
$$;

drop policy if exists claim_returns_select on public.claim_returns;
create policy claim_returns_select on public.claim_returns for select to authenticated using (public.puede_ver_reclamo(claim_id));

-- Resolver y crear el seguimiento en la misma transacción.
create or replace function public.resolver_reclamo_con_seguimiento(
  p_id uuid, p_resolucion public.reclamo_resolucion, p_nota text, p_modalidad text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.claims; estado_pedido public.pedido_estado; nota text := btrim(p_nota);
begin
  if not public.is_admin() or not public.cuenta_activa() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  if p_resolucion is null or coalesce(char_length(nota),0) not between 5 and 3000 then raise exception 'Indica la resolución y sus instrucciones.'; end if;
  select o.status into estado_pedido from public.orders o where o.id = (select order_id from public.claims where id = p_id) for update;
  select * into c from public.claims where id = p_id and status in ('abierto','en_revision') for update;
  if not found or estado_pedido is null then raise exception 'El reclamo ya está cerrado o el pedido no existe.'; end if;
  if p_resolucion = 'cerrado_sin_incumplimiento' then
    if p_modalidad is not null or exists (select 1 from public.claim_returns where claim_id = p_id
      and estado not in ('recibida','cerrada','confirmada')) then raise exception 'Cierra primero el seguimiento pendiente.'; end if;
  else
    if p_modalidad is null or p_modalidad not in ('compra','devolucion','intercambio')
      or (p_resolucion = 'intercambio' and p_modalidad <> 'intercambio') then
      raise exception 'Selecciona cómo se cumplirá la resolución.';
    end if;
    if estado_pedido = 'cancelada' or (p_modalidad <> 'compra' and estado_pedido not in ('entregado','completada')) then
      raise exception 'Para devolver o cambiar el producto, el pedido debe constar como entregado.';
    end if;
    insert into public.claim_returns(claim_id, estado, instrucciones, modalidad)
      values (p_id, case when p_modalidad = 'compra' then 'por_cumplir' else 'ordenada' end, nota, p_modalidad);
  end if;
  update public.claims set status = (case when p_resolucion = 'cerrado_sin_incumplimiento' then 'cerrado' else 'resuelto' end)::public.reclamo_estado,
    resolution = p_resolucion, resolution_note = nota, resolved_by = auth.uid(), resolved_at = now() where id = p_id;
  perform public.registrar_auditoria('revisar_reclamo','claims',p_id::text,
    jsonb_build_object('resolucion',p_resolucion,'seguimiento',p_modalidad,'motivo',nota));
end $$;

create or replace function public.revisar_reclamo(p_id uuid, p_resolucion public.reclamo_resolucion, p_nota text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() or not public.cuenta_activa() then raise exception 'Se requiere acceso administrativo.' using errcode = '42501'; end if;
  if p_resolucion is not null then
    perform public.resolver_reclamo_con_seguimiento(p_id,p_resolucion,p_nota,
      case when p_resolucion = 'intercambio' then 'intercambio' end);
    return;
  end if;
  update public.claims set status='en_revision' where id=p_id and status='abierto';
  if not found then raise exception 'El reclamo ya fue cerrado o ya está en revisión.'; end if;
  perform public.registrar_auditoria('revisar_reclamo','claims',p_id::text);
end $$;
revoke all on function public.resolver_reclamo_con_seguimiento(uuid,public.reclamo_resolucion,text,text) from public, anon;
grant execute on function public.resolver_reclamo_con_seguimiento(uuid,public.reclamo_resolucion,text,text) to authenticated;

create or replace function public.gestionar_devolucion(p_reclamo uuid, p_accion text, p_nota text default null, p_evidencia text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.claims;
  d public.claim_returns;
  siguiente text;
  estado_pedido public.pedido_estado;
  v_nota text := nullif(btrim(p_nota), '');
  comprador boolean;
  tienda boolean;
  admin boolean := public.is_admin();
begin
  if auth.uid() is null or not public.cuenta_activa() then
    raise exception 'Se requiere una cuenta activa.' using errcode = '42501';
  end if;
  if p_accion is null or p_accion not in ('ordenar','enviar','recibir','intervenir','reanudar','cerrar','cumplir','confirmar_cumplimiento') then
    raise exception 'Acción de devolución no válida.';
  end if;
  select status into estado_pedido from public.orders where id = (select order_id from public.claims where id = p_reclamo) for update;
  select * into c from public.claims where id = p_reclamo for update;
  if not found then raise exception 'Reclamo no disponible.' using errcode = '42501'; end if;
  comprador := c.buyer_id = auth.uid();
  tienda := not comprador and public.tienda_gestiona_devolucion(c.store_id);
  if not ((p_accion in ('ordenar','reanudar','cerrar') and admin)
    or (p_accion in ('enviar','confirmar_cumplimiento') and comprador)
    or (p_accion in ('recibir','cumplir') and tienda)
    or (p_accion = 'intervenir' and (admin or comprador or tienda))) then
    raise exception 'No tienes permiso para esta acción.' using errcode = '42501';
  end if;
  if (p_accion in ('ordenar','intervenir','reanudar','cerrar') and coalesce(char_length(v_nota), 0) < 5)
    or coalesce(char_length(v_nota), 0) > 3000 then raise exception 'Escribe entre 5 y 3000 caracteres.'; end if;

  select * into d from public.claim_returns where claim_id = c.id for update;
  if p_accion = 'ordenar' then
    if d.claim_id is not null then raise exception 'El reclamo ya tiene una devolución.'; end if;
    if to_jsonb(c)->>'admin_archived_at' is not null then raise exception 'Recupera el reclamo desde Auditoría.'; end if;
    if not exists (select 1 from public.orders o where o.id = c.order_id and o.status in ('entregado','completada')) then
      raise exception 'Solo se puede ordenar la devolución de un producto entregado.';
    end if;
    if c.status <> 'resuelto' or c.resolution is null or c.resolution = 'cerrado_sin_incumplimiento' then
      raise exception 'Ordena el seguimiento al resolver el reclamo.';
    end if;
    siguiente := 'ordenada';
    insert into public.claim_returns(claim_id, estado, instrucciones, modalidad)
      values (c.id, siguiente, v_nota, case when c.resolution = 'intercambio' then 'intercambio' else 'devolucion' end);
  else
    if d.claim_id is null or d.estado in ('recibida','cerrada','confirmada') then raise exception 'La devolución no está pendiente.'; end if;
    case p_accion
      when 'enviar' then
        if d.estado <> 'ordenada' then raise exception 'La devolución no está pendiente de envío.'; end if;
        if p_evidencia is null or split_part(p_evidencia,'/',1) <> 'devoluciones'
          or split_part(p_evidencia,'/',2) <> c.id::text or split_part(p_evidencia,'/',3) <> auth.uid()::text
          or not exists (select 1 from storage.objects where bucket_id = 'claim-evidence' and name = p_evidencia) then
          raise exception 'Adjunta una evidencia de la devolución.';
        end if;
        siguiente := 'enviada';
      when 'recibir' then
        if d.estado <> 'enviada' then raise exception 'El comprador todavía no registró la devolución.'; end if;
        siguiente := case when d.modalidad = 'intercambio' then 'por_cumplir' else 'recibida' end;
      when 'cumplir' then
        if d.estado <> 'por_cumplir' or estado_pedido not in ('entregado','completada') then
          raise exception 'Primero registra la entrega del producto acordado.';
        end if;
        if p_evidencia is null or split_part(p_evidencia,'/',1) <> 'devoluciones'
          or split_part(p_evidencia,'/',2) <> c.id::text or split_part(p_evidencia,'/',3) <> auth.uid()::text
          or not exists (select 1 from storage.objects where bucket_id = 'claim-evidence' and name = p_evidencia) then
          raise exception 'Adjunta la evidencia de entrega.';
        end if;
        siguiente := 'por_confirmar';
      when 'confirmar_cumplimiento' then
        if d.estado <> 'por_confirmar' or c.status not in ('resuelto','cerrado') then raise exception 'El seguimiento aún no se puede confirmar.'; end if;
        siguiente := 'confirmada';
      when 'intervenir' then
        if d.estado not in ('ordenada','enviada','por_cumplir','por_confirmar') then raise exception 'La devolución ya está en revisión.'; end if;
        siguiente := 'en_revision';
      when 'reanudar' then
        if d.estado <> 'en_revision' then raise exception 'La devolución no está en revisión.'; end if;
        siguiente := coalesce(d.estado_previo, case when d.evidencia is null then 'ordenada' else 'enviada' end);
      when 'cerrar' then siguiente := 'cerrada';
    end case;
    update public.claim_returns set estado = siguiente, actualizado_en = now(),
      evidencia = case when p_accion = 'enviar' then p_evidencia else d.evidencia end,
      evidencia_tienda = case when p_accion = 'cumplir' then p_evidencia else d.evidencia_tienda end,
      estado_previo = case when p_accion = 'intervenir' then d.estado else null end,
      nota = coalesce(v_nota, d.nota)
      where claim_id = c.id;
    if siguiente = 'confirmada' and estado_pedido = 'entregado' then
      perform public.completar_pedido(c.order_id);
    elsif siguiente = 'recibida' and estado_pedido = 'entregado' then
      update public.orders set status = 'cancelada' where id = c.order_id;
      insert into public.delivery_events(order_id,event,from_status,to_status,actor_id)
        values(c.order_id,'estado','entregado','cancelada',auth.uid());
    end if;
  end if;
  perform public.registrar_auditoria('devolucion_' || p_accion, 'reclamo', c.id::text,
    jsonb_build_object('anterior', d.estado, 'nuevo', siguiente, 'motivo', v_nota));
end $$;

alter policy reclamo_subir on storage.objects with check (
  bucket_id = 'claim-evidence' and (
    exists (select 1 from public.claims c
      where c.id = public.try_uuid((storage.foldername(name))[1]) and c.status in ('abierto', 'en_revision'))
    or ((storage.foldername(name))[1] = 'cancelaciones'
      and (storage.foldername(name))[3] = auth.uid()::text
      and public.puede_adjuntar_cancelacion(public.try_uuid((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] = 'devoluciones' and (storage.foldername(name))[3] = auth.uid()::text
      and exists (
        select 1 from public.claim_returns d join public.claims c on c.id = d.claim_id
        where d.claim_id = public.try_uuid((storage.foldername(name))[2])
          and ((d.estado = 'ordenada' and c.buyer_id = auth.uid())
            or (d.estado = 'por_cumplir' and c.buyer_id <> auth.uid() and public.tienda_gestiona_devolucion(c.store_id)))
      ))
  )
);
alter policy reclamo_leer on storage.objects using (
  bucket_id = 'claim-evidence' and (
    public.puede_ver_reclamo(public.try_uuid((storage.foldername(name))[1]))
    or ((storage.foldername(name))[1] = 'cancelaciones' and exists (
      select 1 from public.cancellations c where c.id = public.try_uuid((storage.foldername(name))[2])
    ))
    or ((storage.foldername(name))[1] = 'devoluciones' and exists (
      select 1 from public.claim_returns d
        where d.claim_id = public.try_uuid((storage.foldername(name))[2]) and name in (d.evidencia,d.evidencia_tienda)
    ))
  )
);

-- Reporte de entrega y confirmaciones individuales del pedido.
create table if not exists public.order_close_control (
  order_id uuid primary key references public.orders(id) on delete cascade,
  reporte text check (reporte in ('pendiente','aceptado','rechazado')),
  evidencia text,
  nota_reporte text,
  decision_entrega text,
  comprador_confirmo_at timestamptz,
  tienda_confirmo_at timestamptz,
  intervencion text,
  cierre_admin text
);
alter table public.order_close_control enable row level security;
revoke all on public.order_close_control from public, anon, authenticated;
grant select on public.order_close_control to authenticated;
drop policy if exists order_close_control_select on public.order_close_control;
create policy order_close_control_select on public.order_close_control for select to authenticated
  using (public.puede_ver_pedido(order_id));

create or replace function public.ofertas_tienda_con_reclamo(p_ids uuid[])
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select f.id from public.offers f
  where f.id = any(p_ids)
    and (f.store_id in (select public.tiendas_con_permiso('enviar_ofertas'))
      or exists (select 1 from public.requests r where r.id = f.request_id and r.buyer_id = auth.uid()))
    and exists (
      select 1 from public.offer_history v
      join public.orders p on p.offer_version_id = v.id
      where v.offer_id=f.id and (
        exists (select 1 from public.order_close_control a where a.order_id=p.id and a.reporte='pendiente')
        or exists (
          select 1 from public.claims c left join public.claim_returns d on d.claim_id=c.id
          where c.order_id=p.id and (c.status in ('abierto','en_revision')
            or d.estado not in ('recibida','cerrada','confirmada')
            or (d.claim_id is null and c.resolution in ('intercambio','acuerdo_partes','sancion')))
        )
      )
    )
$$;

revoke all on function public.gestionar_devolucion(uuid,text,text,text), public.ofertas_tienda_con_reclamo(uuid[]) from public, anon;
revoke all on function public.tienda_gestiona_devolucion(uuid) from public, anon;
grant execute on function public.tienda_gestiona_devolucion(uuid) to authenticated;
grant execute on function public.gestionar_devolucion(uuid,text,text,text), public.ofertas_tienda_con_reclamo(uuid[]) to authenticated;

create or replace function public.pedido_tiene_caso_pendiente(p_order uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.claims c left join public.claim_returns d on d.claim_id=c.id
    where c.order_id=p_order and (c.status in ('abierto','en_revision')
      or d.estado not in ('recibida','cerrada','confirmada')
      or (d.claim_id is null and c.resolution in ('intercambio','acuerdo_partes','sancion')))
  )
$$;
revoke all on function public.pedido_tiene_caso_pendiente(uuid) from public, anon, authenticated;

create or replace function public.impedir_cierre_con_seguimiento()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('entregado','completada','cancelada') and exists (
    select 1 from public.order_close_control a where a.order_id=old.id and a.reporte='pendiente'
  ) then raise exception 'Administración debe resolver el reporte de entrega sin código.'; end if;
  if new.status in ('completada','cancelada') and public.pedido_tiene_caso_pendiente(old.id) then
    raise exception 'Primero completa los pasos del reclamo o de su seguimiento.';
  end if;
  if new.status='completada' and not exists (
    select 1 from public.order_close_control a where a.order_id=old.id
      and (a.cierre_admin is not null or (a.comprador_confirmo_at is not null and a.tienda_confirmo_at is not null))
  ) then raise exception 'Se requieren las dos confirmaciones o un cierre administrativo.'; end if;
  return new;
end $$;

drop trigger if exists impedir_cierre_con_seguimiento on public.orders;
create trigger impedir_cierre_con_seguimiento before update of status on public.orders
for each row execute function public.impedir_cierre_con_seguimiento();
revoke all on function public.impedir_cierre_con_seguimiento() from public, anon, authenticated;

create or replace function public.gestionar_cierre_pedido(
  p_order uuid, p_accion text, p_nota text default null, p_evidencia text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  a public.order_close_control;
  actor uuid := auth.uid();
  es_admin boolean := public.is_admin();
  comprador boolean;
  tienda boolean;
  v_nota text := nullif(btrim(p_nota),'');
begin
  if actor is null or not public.cuenta_activa() then raise exception 'Se requiere una cuenta activa.' using errcode='42501'; end if;
  select * into o from public.orders where id=p_order for update;
  if not found then raise exception 'No se encontró el pedido.'; end if;
  comprador := o.buyer_id=actor;
  tienda := not comprador and public.tienda_gestiona_devolucion(o.store_id);
  if p_accion is null or not (
    (p_accion in ('reportar','confirmar_tienda') and tienda)
    or (p_accion='confirmar_comprador' and comprador)
    or (p_accion='intervenir' and (comprador or tienda))
    or (p_accion in ('validar_entrega','rechazar_entrega','cerrar_admin') and es_admin)
  ) then raise exception 'No tienes permiso para esta acción.' using errcode='42501'; end if;
  if (p_accion in ('reportar','intervenir','validar_entrega','rechazar_entrega','cerrar_admin') and coalesce(char_length(v_nota),0)<5)
    or coalesce(char_length(v_nota),0)>3000 then raise exception 'Escribe el motivo (entre 5 y 3000 caracteres).'; end if;

  insert into public.order_close_control(order_id) values(o.id) on conflict do nothing;
  select * into a from public.order_close_control where order_id=o.id for update;

  if p_accion='reportar' then
    if o.status not in ('enviado_o_listo','pendiente_confirmacion') or a.reporte='pendiente' then
      raise exception 'El pedido no admite otro reporte de entrega en este momento.';
    end if;
    if p_evidencia is null or split_part(p_evidencia,'/',1)<>'entregas-sin-codigo'
      or split_part(p_evidencia,'/',2)<>o.id::text or split_part(p_evidencia,'/',3)<>actor::text
      or not exists (select 1 from storage.objects where bucket_id='claim-evidence' and name=p_evidencia)
      then raise exception 'Adjunta un comprobante de entrega.'; end if;
    update public.order_close_control set reporte='pendiente', evidencia=p_evidencia, nota_reporte=v_nota, decision_entrega=null where order_id=o.id;
  elsif p_accion in ('validar_entrega','rechazar_entrega') then
    if a.reporte is distinct from 'pendiente' or o.status not in ('enviado_o_listo','pendiente_confirmacion') then raise exception 'No hay un reporte de entrega pendiente.'; end if;
    update public.order_close_control set reporte=case when p_accion='validar_entrega' then 'aceptado' else 'rechazado' end,
      decision_entrega=v_nota where order_id=o.id;
    if p_accion='validar_entrega' then
      update public.orders set status='entregado' where id=o.id;
      insert into public.delivery_events(order_id,event,from_status,to_status,actor_id) values(o.id,'estado',o.status,'entregado',actor);
    end if;
  else
    if o.status<>'entregado' or a.reporte='pendiente' then raise exception 'La entrega debe estar confirmada antes del cierre.'; end if;
    if p_accion='intervenir' then
      update public.order_close_control set intervencion=v_nota where order_id=o.id;
    else
      if public.pedido_tiene_caso_pendiente(o.id) then raise exception 'Primero completa los pasos del reclamo o de su seguimiento.'; end if;
      if p_accion='cerrar_admin' then
        update public.order_close_control set cierre_admin=v_nota where order_id=o.id returning * into a;
      else
        update public.order_close_control set
          comprador_confirmo_at=case when comprador then coalesce(comprador_confirmo_at,now()) else comprador_confirmo_at end,
          tienda_confirmo_at=case when tienda then coalesce(tienda_confirmo_at,now()) else tienda_confirmo_at end
          where order_id=o.id returning * into a;
      end if;
      if a.cierre_admin is not null or (a.comprador_confirmo_at is not null and a.tienda_confirmo_at is not null) then
        update public.orders set status='completada' where id=o.id;
        insert into public.delivery_events(order_id,event,from_status,to_status,actor_id) values(o.id,'estado','entregado','completada',actor);
        insert into public.notifications(user_id,type,title,body,payload)
          select destino.usuario,'pedido_estado','Operación completada',
            case when a.cierre_admin is not null then 'Administración cerró la operación.' else 'Ambas partes confirmaron el cierre.' end,
            jsonb_build_object('order_id',o.id,'request_id',o.request_id,'para',destino.rol)
          from (select o.buyer_id as usuario,'comprador' as rol
            union all select q.u,'vendedor' from public.usuarios_con_permiso(o.store_id,'gestionar_pedidos') as q(u)) destino;
      end if;
    end if;
  end if;
  perform public.registrar_auditoria('pedido_' || p_accion,'orders',o.id::text,
    jsonb_build_object('motivo',v_nota,'evidencia',p_evidencia));
end $$;

create or replace function public.completar_pedido(p_order uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  select public.gestionar_cierre_pedido(p_order,'confirmar_comprador')
$$;

create or replace function public.reiniciar_confirmaciones_por_reclamo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.order_close_control set comprador_confirmo_at=null, tienda_confirmo_at=null where order_id=new.order_id;
  return new;
end $$;
drop trigger if exists reiniciar_confirmaciones_por_reclamo on public.claims;
create trigger reiniciar_confirmaciones_por_reclamo after insert on public.claims
for each row execute function public.reiniciar_confirmaciones_por_reclamo();

drop policy if exists entrega_sin_codigo_subir on storage.objects;
create policy entrega_sin_codigo_subir on storage.objects for insert to authenticated with check (
  bucket_id='claim-evidence' and (storage.foldername(name))[1]='entregas-sin-codigo'
  and (storage.foldername(name))[3]=auth.uid()::text and exists (
    select 1 from public.orders o where o.id=public.try_uuid((storage.foldername(name))[2])
      and o.status in ('enviado_o_listo','pendiente_confirmacion') and o.buyer_id<>auth.uid()
      and public.tienda_gestiona_devolucion(o.store_id)
  )
);
drop policy if exists entrega_sin_codigo_leer on storage.objects;
create policy entrega_sin_codigo_leer on storage.objects for select to authenticated using (
  bucket_id='claim-evidence' and (storage.foldername(name))[1]='entregas-sin-codigo'
  and exists (select 1 from public.order_close_control a where a.order_id=public.try_uuid((storage.foldername(name))[2]) and a.evidencia=name)
);
revoke all on function public.gestionar_cierre_pedido(uuid,text,text,text) from public, anon;
grant execute on function public.gestionar_cierre_pedido(uuid,text,text,text) to authenticated;
revoke all on function public.reiniciar_confirmaciones_por_reclamo() from public, anon, authenticated;
