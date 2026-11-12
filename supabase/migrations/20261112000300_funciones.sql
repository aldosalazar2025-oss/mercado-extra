-- MERCADO EXTRA · Etapa 4 · Funciones de permisos y disparadores de protección
-- Las funciones SECURITY DEFINER fijan search_path para evitar suplantación de objetos.

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_profiles_updated  before update on public.profiles  for each row execute function public.set_updated_at();
create trigger trg_stores_updated    before update on public.stores    for each row execute function public.set_updated_at();
create trigger trg_products_updated  before update on public.products  for each row execute function public.set_updated_at();
create trigger trg_requests_updated  before update on public.requests  for each row execute function public.set_updated_at();
create trigger trg_orders_updated    before update on public.orders    for each row execute function public.set_updated_at();

-- ───────── Funciones auxiliares de permisos ─────────
-- true cuando la operación viene del servidor (migraciones, SQL Editor o Edge Functions con service_role).
-- Se decide por el rol del JWT y NO por current_user, porque dentro de funciones SECURITY DEFINER
-- current_user es siempre el dueño de la función. Los usuarios de la web siempre llevan rol 'authenticated' o 'anon'.
create or replace function public.es_servicio() returns boolean
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'service_role'
  ) = 'service_role'
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and p.status = 'activo')
$$;

create or replace function public.cuenta_activa() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'activo')
$$;

-- Tiendas donde el usuario actual tiene un permiso (como propietario o como empleado activo).
create or replace function public.tiendas_con_permiso(perm text, solo_aprobadas boolean default false)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id
  from public.stores s
  where public.cuenta_activa()
    and (not solo_aprobadas or s.status = 'aprobada')
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

create or replace function public.puede_ver_pedido(oid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.orders o
    where o.id = oid
      and (o.buyer_id = auth.uid() or o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos')))
  )
$$;

create or replace function public.puede_ver_reclamo(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.claims c
    where c.id = cid
      and (c.buyer_id = auth.uid() or c.store_id in (select public.tiendas_con_permiso('gestionar_pedidos')))
  )
$$;

-- El administrador NO entra al chat por esta vía: debe usar admin_leer_chat (con motivo y auditoría).
create or replace function public.can_access_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.conversations c
    where c.id = cid
      and (c.buyer_id = auth.uid() or c.store_id in (select public.tiendas_con_permiso('chat')))
  )
$$;

create or replace function public.solicitud_visible_para_tienda(rid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.request_matches rm
    join public.requests r on r.id = rm.request_id
    where rm.request_id = rid and not rm.dismissed
      and r.status in ('abierta', 'con_ofertas')
      and rm.store_id in (select public.tiendas_con_permiso('ver_solicitudes', true))
  ) or exists (
    select 1 from public.offers o
    where o.request_id = rid and o.store_id in (select public.tiendas_con_permiso('ver_solicitudes'))
  )
$$;

create or replace function public.solicitud_abierta_para_tienda(rid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.requests r
    join public.request_matches rm on rm.request_id = r.id and rm.store_id = sid and not rm.dismissed
    join public.stores s on s.id = sid and s.status = 'aprobada'
    where r.id = rid and r.status in ('abierta', 'con_ofertas') and r.expires_at > now()
  )
$$;

create or replace function public.puede_calificar(oid uuid, rater uuid, rated uuid, rol public.calificador_rol)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.orders o
    join public.stores s on s.id = o.store_id
    where o.id = oid and o.status in ('entregado', 'completada')
      and (
        (rol = 'comprador' and o.buyer_id = rater and rated = s.owner_id)
        or (rol = 'vendedor' and rated = o.buyer_id and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos')))
      )
  )
$$;

create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- ───────── Alta automática de perfil al registrarse con Google ─────────
create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_auth_nuevo_usuario after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- ───────── Protección de campos sensibles ─────────
-- pg_trigger_depth() > 1 significa que el cambio lo hizo otro disparador del sistema (p. ej. tienda_alta);
-- una sentencia del usuario siempre tiene profundidad 1 y no puede falsearla.
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or pg_trigger_depth() > 1 or public.is_admin() then
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin
     or new.status is distinct from old.status
     or new.is_seller is distinct from old.is_seller
     or new.id is distinct from old.id then
    raise exception 'No puedes modificar el rol ni el estado de tu cuenta' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_profiles_proteger before update on public.profiles
  for each row execute function public.proteger_perfil();

create or replace function public.proteger_tienda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or public.is_admin() then
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Campo reservado a la administración' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not ((old.status = 'aprobada' and new.status = 'inactiva')
              or (old.status = 'rechazada' and new.status = 'pendiente')) then
    raise exception 'Cambio de estado no permitido para la tienda' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_stores_proteger before update on public.stores
  for each row execute function public.proteger_tienda();

-- Al crear una tienda: el dueño queda como miembro "propietario" y su perfil pasa a vendedor.
create or replace function public.tienda_alta() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.store_members (store_id, user_id, role_code, status)
  values (new.id, new.owner_id, 'propietario', 'activo')
  on conflict do nothing;
  update public.profiles set is_seller = true where id = new.owner_id and not is_seller;
  return new;
end $$;
create trigger trg_stores_alta after insert on public.stores
  for each row execute function public.tienda_alta();

create or replace function public.proteger_solicitud() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or pg_trigger_depth() > 1 or public.is_admin() then
    return new;
  end if;
  if new.buyer_id is distinct from old.buyer_id
     or new.selected_offer_id is distinct from old.selected_offer_id
     or new.renewed_count is distinct from old.renewed_count then
    raise exception 'Campo reservado al sistema' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'cancelada' and old.status in ('abierta', 'con_ofertas', 'vencida') then
      null;
    elsif new.status = 'eliminada' and old.status in ('abierta', 'con_ofertas', 'vencida', 'cancelada') then
      null;
    elsif new.status = 'abierta' and old.status = 'vencida' then
      new.expires_at := now() + interval '24 hours';
      new.renewed_count := old.renewed_count + 1;
      return new;
    else
      raise exception 'Cambio de estado de solicitud no permitido' using errcode = '42501';
    end if;
  end if;
  new.expires_at := old.expires_at;
  return new;
end $$;
create trigger trg_requests_proteger before update on public.requests
  for each row execute function public.proteger_solicitud();

-- ───────── Ofertas: versiones inmutables ─────────
create or replace function public.offer_history_antes_insertar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.version := coalesce((select max(h.version) from public.offer_history h where h.offer_id = new.offer_id), 0) + 1;
  new.accepted_by_buyer_at := null;
  new.created_at := now();
  return new;
end $$;
create trigger trg_offer_history_antes_insertar before insert on public.offer_history
  for each row execute function public.offer_history_antes_insertar();

create or replace function public.offer_history_despues_insertar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.offers set current_version_id = new.id where id = new.offer_id;
  return new;
end $$;
create trigger trg_offer_history_despues_insertar after insert on public.offer_history
  for each row execute function public.offer_history_despues_insertar();

create or replace function public.offer_history_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if public.es_servicio() then return old; end if;
    raise exception 'El historial de ofertas no se puede borrar' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'accepted_by_buyer_at') is distinct from (to_jsonb(old) - 'accepted_by_buyer_at') then
    raise exception 'Una propuesta enviada no se puede modificar: envía una nueva propuesta' using errcode = '42501';
  end if;
  if old.accepted_by_buyer_at is not null and new.accepted_by_buyer_at is distinct from old.accepted_by_buyer_at then
    raise exception 'La propuesta ya fue aceptada' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_offer_history_inmutable before update or delete on public.offer_history
  for each row execute function public.offer_history_inmutable();

create or replace function public.oferta_despues_insertar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.requests set status = 'con_ofertas' where id = new.request_id and status = 'abierta';
  return new;
end $$;
create trigger trg_offers_despues_insertar after insert on public.offers
  for each row execute function public.oferta_despues_insertar();

-- ───────── Auditoría y acceso justificado del administrador ─────────
create or replace function public.registrar_auditoria(p_action text, p_entity text, p_entity_id text default null, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.es_servicio() or public.is_admin()) then
    raise exception 'Solo la administración puede registrar auditoría manual' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;

create or replace function public.admin_leer_chat(p_conversation uuid, p_motivo text)
returns setof public.messages
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Solo la administración puede usar esta función' using errcode = '42501';
  end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 10 then
    raise exception 'Indica el motivo justificado (mínimo 10 caracteres)' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'admin_leer_chat', 'conversations', p_conversation::text, jsonb_build_object('motivo', p_motivo));
  return query select m.* from public.messages m where m.conversation_id = p_conversation order by m.created_at;
end $$;

-- ───────── Perfil público reducido (sin DNI, correo ni teléfono) ─────────
create view public.perfiles_publicos as
select
  p.id,
  split_part(p.full_name, ' ', 1) as nombre,
  p.avatar_url,
  p.is_seller,
  (select round(avg(r.score)::numeric, 2) from public.ratings r where r.rated_id = p.id and r.status = 'visible') as calificacion_promedio,
  (select count(*) from public.ratings r where r.rated_id = p.id and r.status = 'visible') as total_calificaciones,
  (select count(*) from public.orders o where o.buyer_id = p.id and o.status = 'completada') as compras_completadas,
  (select count(*) from public.orders o join public.stores s on s.id = o.store_id
     where s.owner_id = p.id and o.status = 'completada') as ventas_completadas
from public.profiles p
where p.status <> 'bloqueado';
