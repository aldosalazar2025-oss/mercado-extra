-- MERCADO EXTRA · Etapa 9 · Coincidencias entre solicitudes y tiendas + notificaciones internas
-- Regla: una tienda recibe una solicitud solo si vende algo de su categoría (por sus categorías declaradas
-- o por sus productos publicados). Texto, productos y etiquetas suben el puntaje. Hay topes para evitar spam:
-- máximo 20 tiendas por solicitud y máximo 30 avisos por tienda cada 24 horas.

-- 1) Puntaje de coincidencia entre una solicitud y una tienda (sin filas = no está relacionada).
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
begin
  select * into r from public.requests where id = p_request;
  select * into s from public.stores where id = p_store;
  if r.id is null or s.id is null or r.category_id is null then return; end if;
  if s.owner_id = r.buyer_id then return; end if;   -- una tienda no recibe las solicitudes de su propio dueño

  -- la categoría es obligatoria: declarada por la tienda o presente en sus productos
  if not (
    exists (
      select 1 from public.store_categories sc join public.categories c on c.id = sc.category_id
      where sc.store_id = p_store
        and (c.id = r.category_id or c.parent_id = r.category_id
             or c.id = (select parent_id from public.categories where id = r.category_id))
    )
    or exists (
      select 1 from public.products p
      where p.store_id = p_store and p.status = 'activo' and not p.admin_hidden and p.category_id = r.category_id
    )
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

-- 2) Calcula las tiendas destinatarias de una solicitud, guarda las coincidencias y avisa a quien corresponde.
create or replace function public.emparejar_solicitud(p_request uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.requests;
  c record;
  m record;
  v_ids uuid[] := '{}';
  v_nuevos integer := 0;
  v_categoria text;
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

    insert into public.notifications (user_id, type, title, body, payload)
    select distinct q.uid, 'solicitud_nueva', 'Nueva solicitud: ' || r.title,
           'Presupuesto hasta S/ ' || r.max_budget::text || coalesce(' · ' || v_categoria, ''),
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

-- 3) Cuando una tienda se aprueba o suma categorías, revisa las solicitudes que siguen abiertas.
create or replace function public.emparejar_tienda(p_store uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n integer := 0;
begin
  if not exists (select 1 from public.stores where id = p_store and status = 'aprobada') then return 0; end if;
  for r in
    select id from public.requests
    where status in ('abierta', 'con_ofertas') and expires_at > now() and category_id is not null
    order by created_at desc limit 200
  loop
    n := n + public.emparejar_solicitud(r.id);
  end loop;
  return n;
end $$;

-- 4) Disparadores
create or replace function public.trg_solicitud_emparejar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.emparejar_solicitud(new.id);
  return new;
end $$;
create trigger trg_requests_emparejar_ins after insert on public.requests
  for each row when (new.status = 'abierta') execute function public.trg_solicitud_emparejar();
create trigger trg_requests_emparejar_upd after update on public.requests
  for each row when (
    new.status in ('abierta', 'con_ofertas') and (
      new.category_id is distinct from old.category_id or new.title is distinct from old.title
      or new.description is distinct from old.description or new.attributes is distinct from old.attributes
      or (old.status = 'vencida' and new.status = 'abierta'))
  ) execute function public.trg_solicitud_emparejar();

create or replace function public.trg_tienda_emparejar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'stores' then
    perform public.emparejar_tienda(new.id);
  else
    perform public.emparejar_tienda(new.store_id);
  end if;
  return new;
end $$;
create trigger trg_stores_emparejar after update on public.stores
  for each row when (new.status = 'aprobada' and old.status is distinct from 'aprobada') execute function public.trg_tienda_emparejar();
create trigger trg_store_categories_emparejar after insert on public.store_categories
  for each row execute function public.trg_tienda_emparejar();

revoke all on function public.coincidencia(uuid, uuid) from public, anon, authenticated;
revoke all on function public.emparejar_solicitud(uuid) from public, anon, authenticated;
revoke all on function public.emparejar_tienda(uuid) from public, anon, authenticated;

-- 5) La tienda puede descartar una solicitud que no le interesa (solo ese campo).
revoke update on public.request_matches from authenticated;
grant update (dismissed) on public.request_matches to authenticated;
create policy matches_descartar on public.request_matches for update to authenticated
  using (store_id in (select public.tiendas_con_permiso('ver_solicitudes')))
  with check (store_id in (select public.tiendas_con_permiso('ver_solicitudes')));

-- 6) Índice para el tope diario de avisos y publicación en tiempo real de las notificaciones.
create index idx_notifications_tope on public.notifications ((payload ->> 'store_id'), created_at) where type = 'solicitud_nueva';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
