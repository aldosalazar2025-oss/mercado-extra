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

create or replace function public.reactivar_por_apelacion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source_type = 'otro' and new.source_id = new.user_id and new.ends_at is null
    and new.appeal_status = 'aceptada' and old.appeal_status = 'pendiente' then
    update public.profiles set status = 'activo' where id = new.user_id and not is_admin
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

commit;
