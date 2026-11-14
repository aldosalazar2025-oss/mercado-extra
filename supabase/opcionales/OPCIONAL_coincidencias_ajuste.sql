-- MERCADO EXTRA · Etapa 9 (ajuste) · Coincidencias más precisas y avisos que indican la tienda
-- 1) Si una tienda declaró sus categorías, solo esas cuentan (antes también contaban las de sus productos).
-- 2) El aviso ahora dice "Para <tienda>", útil para quien tiene varias tiendas.

create or replace function public.coincidencia(p_request uuid, p_store uuid)
returns table (puntaje numeric, motivos text[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r public.requests;
  s public.stores;
  v_puntaje numeric := 0;
  v_motivos text[] := '{}';
  v_texto text;
  v_consulta tsquery;
  v_declara boolean;
begin
  select * into r from public.requests where id = p_request;
  select * into s from public.stores where id = p_store;
  if r.id is null or s.id is null or r.category_id is null then return; end if;
  if s.owner_id = r.buyer_id then return; end if;   -- una tienda no recibe las solicitudes de su propio dueño

  -- la categoría es obligatoria. Si la tienda declaró categorías, solo cuentan esas;
  -- si no declaró ninguna, se usan las categorías de sus productos publicados.
  select exists (select 1 from public.store_categories where store_id = p_store) into v_declara;
  if v_declara then
    if not exists (
      select 1 from public.store_categories sc join public.categories c on c.id = sc.category_id
      where sc.store_id = p_store
        and (c.id = r.category_id or c.parent_id = r.category_id
             or c.id = (select parent_id from public.categories where id = r.category_id))
    ) then
      return;
    end if;
  elsif not exists (
    select 1 from public.products p
    where p.store_id = p_store and p.status = 'activo' and not p.admin_hidden and p.category_id = r.category_id
  ) then
    return;
  end if;
  v_puntaje := 1;
  v_motivos := array['categoria'];

  v_texto := lower(coalesce(r.title, '') || ' ' || coalesce(r.description, '') || ' ' || coalesce(r.attributes::text, ''));
  v_consulta := nullif(replace(plainto_tsquery('spanish', r.title)::text, '&', '|'), '')::tsquery;

  if v_consulta is not null and exists (
    select 1 from public.products p
    where p.store_id = p_store and p.status = 'activo' and not p.admin_hidden and p.search_vector @@ v_consulta
  ) then
    v_puntaje := v_puntaje + 2;
    v_motivos := array_append(v_motivos, 'producto');
  end if;

  if exists (
    select 1 from public.product_tags t join public.products p on p.id = t.product_id
    where p.store_id = p_store and p.status = 'activo' and not p.admin_hidden
      and char_length(t.tag) >= 3 and position(t.tag in v_texto) > 0
  ) then
    v_puntaje := v_puntaje + 1;
    v_motivos := array_append(v_motivos, 'etiqueta');
  end if;

  return query select v_puntaje, v_motivos;
end $$;

create or replace function public.emparejar_solicitud(p_request uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.requests;
  c record;
  m record;
  v_ids uuid[] := '{}';
  v_nuevos integer := 0;
  v_categoria text;
  v_tienda text;
begin
  select * into r from public.requests where id = p_request;
  if r.id is null or r.status not in ('abierta', 'con_ofertas') or r.category_id is null then
    return 0;
  end if;

  for c in
    select s.id as store_id, k.puntaje, k.motivos
    from public.stores s
    cross join lateral public.coincidencia(p_request, s.id) k
    where s.status = 'aprobada'
    order by k.puntaje desc, s.created_at asc
    limit 20
  loop
    insert into public.request_matches (request_id, store_id, score, matched_by)
    values (p_request, c.store_id, c.puntaje, c.motivos)
    on conflict (request_id, store_id) do update set score = excluded.score, matched_by = excluded.matched_by;
    v_ids := v_ids || c.store_id;
  end loop;

  -- tiendas que dejaron de coincidir (y no ofertaron) salen de la lista
  delete from public.request_matches rm
  where rm.request_id = p_request and not (rm.store_id = any (v_ids))
    and not exists (select 1 from public.offers o where o.request_id = p_request and o.store_id = rm.store_id);

  select name into v_categoria from public.categories where id = r.category_id;

  for m in
    select rm.store_id from public.request_matches rm
    where rm.request_id = p_request and rm.notified_at is null and not rm.dismissed
  loop
    -- tope diario por tienda: si lo supera, la solicitud igual aparece en "Solicitudes recibidas", sin aviso
    if (select count(*) from public.notifications n
        where n.type = 'solicitud_nueva' and n.payload ->> 'store_id' = m.store_id::text
          and n.created_at > now() - interval '24 hours') >= 30 then
      continue;
    end if;

    select name into v_tienda from public.stores where id = m.store_id;
    insert into public.notifications (user_id, type, title, body, payload)
    select distinct q.uid, 'solicitud_nueva', 'Nueva solicitud: ' || r.title,
           'Para ' || v_tienda || ' · Presupuesto hasta S/ ' || r.max_budget::text || coalesce(' · ' || v_categoria, ''),
           jsonb_build_object('request_id', r.id, 'store_id', m.store_id)
    from (
      select s.owner_id as uid from public.stores s where s.id = m.store_id
      union
      select mem.user_id from public.store_members mem
      where mem.store_id = m.store_id and mem.status = 'activo' and mem.user_id is not null
        and ('ver_solicitudes' = any (mem.extra_permissions)
             or exists (select 1 from public.role_permissions rp where rp.role_code = mem.role_code and rp.permission_code = 'ver_solicitudes'))
    ) q
    where q.uid is not null and q.uid <> r.buyer_id
      and exists (select 1 from public.profiles p where p.id = q.uid and p.status = 'activo');

    update public.request_matches set notified_at = now() where request_id = p_request and store_id = m.store_id;
    v_nuevos := v_nuevos + 1;
  end loop;
  return v_nuevos;
end $$;
