-- MERCADO EXTRA · Etapa 6 · Tiendas y empleados

-- 1) El correo del perfil no se puede cambiar desde la web (sirve para reconocer invitaciones).
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or pg_trigger_depth() > 1 or public.is_admin() then
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin
     or new.status is distinct from old.status
     or new.is_seller is distinct from old.is_seller
     or new.email is distinct from old.email
     or new.id is distinct from old.id then
    raise exception 'No puedes modificar el rol, el estado ni el correo de tu cuenta' using errcode = '42501';
  end if;
  return new;
end $$;

-- 2) Al reenviar una tienda rechazada, el dueño puede limpiar el motivo anterior.
create or replace function public.proteger_tienda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or public.is_admin() then
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Campo reservado a la administración' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not ((old.status = 'aprobada' and new.status = 'inactiva')
              or (old.status = 'rechazada' and new.status = 'pendiente')) then
    raise exception 'Cambio de estado no permitido para la tienda' using errcode = '42501';
  end if;
  if new.rejection_reason is distinct from old.rejection_reason
     and not (old.status = 'rechazada' and new.status = 'pendiente' and new.rejection_reason is null) then
    raise exception 'Campo reservado a la administración' using errcode = '42501';
  end if;
  return new;
end $$;

-- 3) Empleados: reglas que impiden escalar privilegios.
create or replace function public.proteger_miembro() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare es_dueno boolean;
begin
  new.invited_email := nullif(lower(trim(new.invited_email)), '');
  if exists (select 1 from unnest(new.extra_permissions) p where p not in (select code from public.permissions)) then
    raise exception 'Permiso desconocido' using errcode = '22023';
  end if;
  if public.es_servicio() or pg_trigger_depth() > 1 or public.is_admin() then
    return new;
  end if;
  select (s.owner_id = auth.uid()) into es_dueno from public.stores s where s.id = new.store_id;
  if coalesce(es_dueno, false) then
    return new;
  end if;
  -- quien no es propietario:
  if tg_op = 'UPDATE' and old.user_id is not distinct from auth.uid() then
    raise exception 'No puedes modificar tu propio acceso' using errcode = '42501';
  end if;
  if new.role_code = 'administrador_tienda' or (tg_op = 'UPDATE' and old.role_code = 'administrador_tienda') then
    raise exception 'Solo el propietario administra a los administradores de tienda' using errcode = '42501';
  end if;
  if 'gestionar_planes' = any (new.extra_permissions) or 'gestionar_empleados' = any (new.extra_permissions) then
    raise exception 'Ese permiso solo lo concede el propietario' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_store_members_proteger before insert or update on public.store_members
  for each row execute function public.proteger_miembro();

-- 4) Invitaciones: el invitado las ve y responde explícitamente.
--    El correo se toma del token de sesión (verificado por Google), no del perfil editable.
create or replace function public.mis_invitaciones()
returns table (id uuid, store_id uuid, store_name text, role_code text, role_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.id, m.store_id, s.name, m.role_code, r.name
  from public.store_members m
  join public.stores s on s.id = m.store_id
  join public.roles r on r.code = m.role_code
  where m.status = 'invitado' and m.user_id is null
    and m.invited_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and auth.uid() is not null
$$;

create or replace function public.responder_invitacion(p_id uuid, p_aceptar boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.store_members;
begin
  if auth.uid() is null or not public.cuenta_activa() then
    raise exception 'Debes iniciar sesión con una cuenta activa' using errcode = '42501';
  end if;
  select * into m from public.store_members
  where id = p_id and status = 'invitado' and user_id is null
    and invited_email = lower(coalesce(auth.jwt() ->> 'email', ''));
  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;
  if p_aceptar then
    if exists (select 1 from public.store_members x where x.store_id = m.store_id and x.user_id = auth.uid()) then
      raise exception 'Ya perteneces a esta tienda' using errcode = '23505';
    end if;
    update public.store_members set user_id = auth.uid(), status = 'activo' where id = p_id;
  else
    delete from public.store_members where id = p_id;
  end if;
end $$;

revoke all on function public.mis_invitaciones() from public, anon;
revoke all on function public.responder_invitacion(uuid, boolean) from public, anon;
grant execute on function public.mis_invitaciones() to authenticated;
grant execute on function public.responder_invitacion(uuid, boolean) to authenticated;
