-- MERCADO EXTRA · Etapa 10 · Ofertas y negociación

-- 1) Una propuesta puede ser aceptada o rechazada por el comprador (una sola vez).
alter table public.offer_history add column rejected_by_buyer_at timestamptz;

create or replace function public.offer_history_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if public.es_servicio() then return old; end if;
    raise exception 'El historial de ofertas no se puede borrar' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'accepted_by_buyer_at' - 'rejected_by_buyer_at') is distinct from (to_jsonb(old) - 'accepted_by_buyer_at' - 'rejected_by_buyer_at') then
    raise exception 'Una propuesta enviada no se puede modificar: envía una nueva propuesta' using errcode = '42501';
  end if;
  if (old.accepted_by_buyer_at is not null and new.accepted_by_buyer_at is distinct from old.accepted_by_buyer_at)
     or (old.rejected_by_buyer_at is not null and new.rejected_by_buyer_at is distinct from old.rejected_by_buyer_at) then
    raise exception 'La propuesta ya fue respondida' using errcode = '42501';
  end if;
  if new.accepted_by_buyer_at is not null and new.rejected_by_buyer_at is not null then
    raise exception 'Una propuesta no puede ser aceptada y rechazada a la vez' using errcode = '42501';
  end if;
  return new;
end $$;

-- El comprador ya no acepta propuestas "a mano": lo hace elegir_oferta / responder_propuesta.
drop policy offer_history_aceptar on public.offer_history;
drop policy offer_history_insert on public.offer_history;
create policy offer_history_insert on public.offer_history for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.offers o
      where o.id = offer_id and o.status in ('enviada', 'aceptada')
        and o.store_id in (select public.tiendas_con_permiso('enviar_ofertas', true))
    )
  );

-- 2) Reglas al registrar una propuesta.
create or replace function public.offer_history_antes_insertar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.offers; r public.requests; v_aceptada integer;
begin
  new.version := coalesce((select max(h.version) from public.offer_history h where h.offer_id = new.offer_id), 0) + 1;
  new.accepted_by_buyer_at := null;
  new.rejected_by_buyer_at := null;
  new.created_at := now();
  if public.es_servicio() then return new; end if;

  select * into o from public.offers where id = new.offer_id;
  select * into r from public.requests where id = o.request_id;
  if new.price <= 0 then
    raise exception 'Indica un precio mayor que cero' using errcode = '22023';
  end if;
  if cardinality(new.photo_paths) > 5
     or exists (select 1 from unnest(new.photo_paths) p where p not like r.id::text || '/' || o.store_id::text || '/%') then
    raise exception 'Fotos de la oferta no válidas (máximo 5, de la carpeta de la oferta)' using errcode = '23514';
  end if;

  if o.status = 'enviada' then
    if r.status not in ('abierta', 'con_ofertas') or r.expires_at <= now() then
      raise exception 'La solicitud ya no recibe ofertas' using errcode = '42501';
    end if;
  elsif o.status = 'aceptada' then
    if not exists (
      select 1 from public.orders od
      where od.request_id = r.id and od.store_id = o.store_id and od.status in ('oferta_aceptada', 'compra_coordinada', 'en_preparacion')
    ) then
      raise exception 'El pedido ya no admite cambios de precio' using errcode = '42501';
    end if;
    select max(h.version) into v_aceptada from public.offer_history h where h.offer_id = new.offer_id and h.accepted_by_buyer_at is not null;
    if exists (
      select 1 from public.offer_history h
      where h.offer_id = new.offer_id and h.version > coalesce(v_aceptada, 0)
        and h.accepted_by_buyer_at is null and h.rejected_by_buyer_at is null
    ) then
      raise exception 'Ya hay una propuesta pendiente de respuesta del comprador' using errcode = '42501';
    end if;
  else
    raise exception 'Esta oferta ya no admite nuevas propuestas' using errcode = '42501';
  end if;
  return new;
end $$;

-- 3) Avisos al comprador cuando llega una oferta o una propuesta nueva.
create or replace function public.offer_history_despues_insertar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.offers; r public.requests; v_tienda text; v_tipo text; v_titulo text;
begin
  update public.offers set current_version_id = new.id where id = new.offer_id;
  if public.es_servicio() then return new; end if;
  select * into o from public.offers where id = new.offer_id;
  select * into r from public.requests where id = o.request_id;
  select name into v_tienda from public.stores where id = o.store_id;
  if new.version = 1 then
    v_tipo := 'oferta_nueva'; v_titulo := 'Nueva oferta para tu solicitud';
  elsif o.status = 'enviada' then
    v_tipo := 'oferta_actualizada'; v_titulo := 'Una tienda actualizó su oferta';
  else
    v_tipo := 'propuesta_nueva'; v_titulo := 'Nueva propuesta de precio';
  end if;
  insert into public.notifications (user_id, type, title, body, payload)
  values (r.buyer_id, v_tipo, v_titulo, v_tienda || ' ofrece S/ ' || new.price::text || ' por «' || r.title || '»',
          jsonb_build_object('request_id', r.id, 'offer_id', o.id, 'store_id', o.store_id));
  return new;
end $$;

-- 4) Si se retiran todas las ofertas, la solicitud vuelve a estar abierta.
create or replace function public.oferta_retirada() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.offers where request_id = new.request_id and status = 'enviada') then
    update public.requests set status = 'abierta' where id = new.request_id and status = 'con_ofertas';
  end if;
  return new;
end $$;
create trigger trg_offers_retirada after update of status on public.offers
  for each row when (new.status = 'retirada' and old.status = 'enviada') execute function public.oferta_retirada();

-- 5) La solicitud solo pasa a "atendida" cuando ya existe una oferta aceptada por la función elegir_oferta.
create or replace function public.proteger_solicitud() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or pg_trigger_depth() > 1 or public.is_admin() then
    return new;
  end if;
  if old.status = 'con_ofertas' and new.status = 'atendida' and old.selected_offer_id is null and new.selected_offer_id is not null
     and new.buyer_id = old.buyer_id and new.renewed_count = old.renewed_count
     and exists (select 1 from public.offers o where o.id = new.selected_offer_id and o.request_id = new.id and o.status = 'aceptada') then
    new.expires_at := old.expires_at;
    return new;
  end if;
  if new.buyer_id is distinct from old.buyer_id
     or new.selected_offer_id is distinct from old.selected_offer_id
     or new.renewed_count is distinct from old.renewed_count then
    raise exception 'Campo reservado al sistema' using errcode = '42501';
  end if;
  if (new.title is distinct from old.title or new.description is distinct from old.description
      or new.category_id is distinct from old.category_id or new.attributes is distinct from old.attributes
      or new.max_budget is distinct from old.max_budget or new.budget_negotiable is distinct from old.budget_negotiable)
     and old.status not in ('abierta', 'vencida') then
    raise exception 'La solicitud ya no se puede modificar porque recibió ofertas o fue cerrada' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'cancelada' and old.status in ('abierta', 'con_ofertas', 'vencida') then
      null;
    elsif new.status = 'eliminada' and old.status in ('abierta', 'con_ofertas', 'vencida', 'cancelada') then
      null;
    elsif new.status = 'abierta' and old.status = 'vencida' then
      if old.renewed_count >= 5 then
        raise exception 'Alcanzaste el máximo de renovaciones. Publica una solicitud nueva.' using errcode = '42501';
      end if;
      new.expires_at := now() + interval '24 hours';
      new.renewed_count := old.renewed_count + 1;
      return new;
    elsif new.status = 'vencida' and old.status = 'abierta' and old.expires_at <= now() then
      null;
    else
      raise exception 'Cambio de estado de solicitud no permitido' using errcode = '42501';
    end if;
  end if;
  new.expires_at := old.expires_at;
  return new;
end $$;

-- 6) Auxiliar: personas de una tienda con un permiso (solo para uso interno del sistema).
create or replace function public.usuarios_con_permiso(p_store uuid, p_perm text) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.owner_id from public.stores s where s.id = p_store
  union
  select m.user_id from public.store_members m
  where m.store_id = p_store and m.status = 'activo' and m.user_id is not null
    and (p_perm = any (m.extra_permissions)
         or exists (select 1 from public.role_permissions rp where rp.role_code = m.role_code and rp.permission_code = p_perm))
$$;
revoke all on function public.usuarios_con_permiso(uuid, text) from public, anon, authenticated;

-- 7) Enviar una oferta o una nueva propuesta (todo en un paso; se ejecuta con los permisos de quien llama).
create or replace function public.enviar_oferta(
  p_request uuid, p_store uuid, p_price numeric, p_description text default null, p_availability text default null,
  p_delivery_terms text default null, p_eta text default null, p_notes text default null, p_photos text[] default '{}'
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_offer uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para enviar ofertas' using errcode = '42501';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Indica un precio mayor que cero' using errcode = '22023';
  end if;
  select id into v_offer from public.offers where request_id = p_request and store_id = p_store;
  if v_offer is null then
    insert into public.offers (request_id, store_id, created_by) values (p_request, p_store, auth.uid()) returning id into v_offer;
  end if;
  insert into public.offer_history (offer_id, price, description, availability, delivery_terms, eta, notes, photo_paths, created_by)
  values (v_offer, round(p_price, 2), nullif(trim(p_description), ''), nullif(trim(p_availability), ''), nullif(trim(p_delivery_terms), ''),
          nullif(trim(p_eta), ''), nullif(trim(p_notes), ''), coalesce(p_photos, '{}'), auth.uid());
  return v_offer;
end $$;

-- 8) El comprador elige una oferta: se cierra la solicitud, se crea el pedido y el chat, y se avisa a las tiendas.
create or replace function public.elegir_oferta(p_version uuid, p_modo public.entrega_modo) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h public.offer_history; o public.offers; r public.requests; s public.stores; v_order uuid;
begin
  if auth.uid() is null or not public.cuenta_activa() then
    raise exception 'Debes iniciar sesión con una cuenta activa' using errcode = '42501';
  end if;
  select * into h from public.offer_history where id = p_version;
  if not found then raise exception 'Oferta no encontrada' using errcode = 'P0002'; end if;
  select * into o from public.offers where id = h.offer_id;
  select * into r from public.requests where id = o.request_id for update;
  if r.buyer_id <> auth.uid() then
    raise exception 'Esta solicitud no es tuya' using errcode = '42501';
  end if;
  if r.status <> 'con_ofertas' then
    raise exception 'La solicitud ya fue atendida o no tiene ofertas disponibles' using errcode = '22023';
  end if;
  if o.status <> 'enviada' then
    raise exception 'Esa oferta ya no está disponible' using errcode = '22023';
  end if;
  if o.current_version_id is distinct from p_version then
    raise exception 'La tienda actualizó su propuesta. Revisa el nuevo precio antes de elegir.' using errcode = '22023';
  end if;
  select * into s from public.stores where id = o.store_id;
  if s.status <> 'aprobada' then
    raise exception 'La tienda ya no está disponible' using errcode = '22023';
  end if;
  if (p_modo = 'domicilio' and not s.offers_delivery) or (p_modo = 'recojo' and not s.offers_pickup) then
    raise exception 'La tienda no ofrece esa modalidad de entrega' using errcode = '22023';
  end if;

  update public.offer_history set accepted_by_buyer_at = now() where id = p_version;
  update public.offers set status = 'aceptada' where id = o.id;
  update public.offers set status = 'rechazada' where request_id = r.id and id <> o.id and status = 'enviada';
  update public.requests set status = 'atendida', selected_offer_id = o.id where id = r.id;

  insert into public.orders (request_id, offer_version_id, buyer_id, store_id, delivery_mode, status, agreed_price)
  values (r.id, p_version, r.buyer_id, s.id, p_modo, 'oferta_aceptada', h.price) returning id into v_order;
  insert into public.order_items (order_id, description, quantity, unit_price) values (v_order, r.title, 1, h.price);
  insert into public.conversations (request_id, offer_id, order_id, store_id, buyer_id, status)
  values (r.id, o.id, v_order, s.id, r.buyer_id, 'activa');
  insert into public.delivery_events (order_id, event, to_status, actor_id) values (v_order, 'oferta_aceptada', 'oferta_aceptada', auth.uid());

  insert into public.notifications (user_id, type, title, body, payload)
  select q.u, 'oferta_elegida', '¡Tu oferta fue elegida!', 'El comprador eligió tu oferta por «' || r.title || '»',
         jsonb_build_object('request_id', r.id, 'order_id', v_order, 'store_id', s.id)
  from (select distinct public.usuarios_con_permiso(s.id, 'gestionar_pedidos') as u) q
  where q.u <> r.buyer_id;

  insert into public.notifications (user_id, type, title, body, payload)
  select distinct x.u, 'solicitud_atendida', 'Solicitud atendida', 'La solicitud «' || r.title || '» ya fue atendida por otra tienda.',
         jsonb_build_object('request_id', r.id, 'store_id', st.store_id)
  from (
    select rm.store_id from public.request_matches rm where rm.request_id = r.id and rm.store_id <> s.id
    union
    select o2.store_id from public.offers o2 where o2.request_id = r.id and o2.store_id <> s.id
  ) st
  cross join lateral public.usuarios_con_permiso(st.store_id, 'ver_solicitudes') as x(u)
  where x.u <> r.buyer_id;

  return v_order;
end $$;

-- 9) Después de elegir: el comprador acepta o rechaza una nueva propuesta de precio de la tienda elegida.
create or replace function public.responder_propuesta(p_version uuid, p_aceptar boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h public.offer_history; o public.offers; r public.requests; od public.orders; v_aceptada integer; v_tienda text;
begin
  if auth.uid() is null or not public.cuenta_activa() then
    raise exception 'Debes iniciar sesión con una cuenta activa' using errcode = '42501';
  end if;
  select * into h from public.offer_history where id = p_version;
  if not found then raise exception 'Propuesta no encontrada' using errcode = 'P0002'; end if;
  select * into o from public.offers where id = h.offer_id;
  select * into r from public.requests where id = o.request_id;
  if r.buyer_id <> auth.uid() then
    raise exception 'Esta propuesta no es para ti' using errcode = '42501';
  end if;
  if o.status <> 'aceptada' then
    raise exception 'Esta oferta no es la elegida' using errcode = '22023';
  end if;
  select max(x.version) into v_aceptada from public.offer_history x where x.offer_id = o.id and x.accepted_by_buyer_at is not null;
  if h.accepted_by_buyer_at is not null or h.rejected_by_buyer_at is not null or h.version <= coalesce(v_aceptada, 0) then
    raise exception 'Esta propuesta ya no está pendiente' using errcode = '22023';
  end if;
  select * into od from public.orders where request_id = r.id and store_id = o.store_id for update;
  if od.status not in ('oferta_aceptada', 'compra_coordinada', 'en_preparacion') then
    raise exception 'El pedido ya no admite cambios de precio' using errcode = '22023';
  end if;

  if p_aceptar then
    update public.offer_history set accepted_by_buyer_at = now() where id = p_version;
    update public.orders set offer_version_id = p_version, agreed_price = h.price where id = od.id;
    update public.order_items set unit_price = h.price where order_id = od.id;
    insert into public.delivery_events (order_id, event, actor_id) values (od.id, 'precio_actualizado', auth.uid());
  else
    update public.offer_history set rejected_by_buyer_at = now() where id = p_version;
  end if;

  select name into v_tienda from public.stores where id = o.store_id;
  insert into public.notifications (user_id, type, title, body, payload)
  select distinct q.u, 'propuesta_respondida',
         case when p_aceptar then 'El comprador aceptó tu nueva propuesta' else 'El comprador rechazó tu nueva propuesta' end,
         'Propuesta de S/ ' || h.price::text || ' por «' || r.title || '»',
         jsonb_build_object('request_id', r.id, 'order_id', od.id, 'store_id', o.store_id)
  from public.usuarios_con_permiso(o.store_id, 'enviar_ofertas') as q(u)
  where q.u <> r.buyer_id;
end $$;

revoke all on function public.enviar_oferta(uuid, uuid, numeric, text, text, text, text, text, text[]) from public, anon;
revoke all on function public.elegir_oferta(uuid, public.entrega_modo) from public, anon;
revoke all on function public.responder_propuesta(uuid, boolean) from public, anon;
grant execute on function public.enviar_oferta(uuid, uuid, numeric, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.elegir_oferta(uuid, public.entrega_modo) to authenticated;
grant execute on function public.responder_propuesta(uuid, boolean) to authenticated;

-- 10) Fotos de las ofertas: bucket privado, carpeta {solicitud}/{tienda}/archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offer-images', 'offer-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.puede_subir_foto_oferta(rid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select sid in (select public.tiendas_con_permiso('enviar_ofertas', true))
    and (public.solicitud_abierta_para_tienda(rid, sid)
         or exists (select 1 from public.offers o where o.request_id = rid and o.store_id = sid and o.status in ('enviada', 'aceptada')))
$$;
create or replace function public.puede_ver_fotos_oferta(rid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.requests r where r.id = rid and r.buyer_id = auth.uid())
    or sid in (select public.tiendas_con_permiso('enviar_ofertas'))
    or public.is_admin()
$$;

create policy "oferta_img_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'offer-images' and public.puede_subir_foto_oferta(
    public.try_uuid((storage.foldername(name))[1]), public.try_uuid((storage.foldername(name))[2])));
create policy "oferta_img_leer" on storage.objects for select to authenticated
  using (bucket_id = 'offer-images' and public.puede_ver_fotos_oferta(
    public.try_uuid((storage.foldername(name))[1]), public.try_uuid((storage.foldername(name))[2])));
create policy "oferta_img_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'offer-images' and public.puede_subir_foto_oferta(
    public.try_uuid((storage.foldername(name))[1]), public.try_uuid((storage.foldername(name))[2])));
