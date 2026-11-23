-- MERCADO EXTRA · Etapa 15 · Panel administrativo
begin;

create policy requests_select_admin on public.requests for select to authenticated using (public.is_admin());

create function public.admin_resumen() returns jsonb
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

create function public.admin_estado_usuario(p_id uuid, p_estado public.cuenta_estado, p_motivo text) returns void
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
  update public.profiles set status = p_estado where id = p_id;
  perform public.registrar_auditoria('cambiar_estado_usuario', 'profiles', p_id::text,
    jsonb_build_object('anterior', v_anterior, 'nuevo', p_estado, 'motivo', btrim(p_motivo)));
end $$;

create function public.admin_resolver_denuncia_calificacion(p_id uuid, p_aceptar boolean, p_motivo text) returns void
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

commit;
