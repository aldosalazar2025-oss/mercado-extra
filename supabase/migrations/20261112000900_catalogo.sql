-- MERCADO EXTRA · Etapa 7 · Catálogo de productos

-- 1) Moderación: la administración puede retirar un producto y el vendedor no puede volver a publicarlo.
alter table public.products
  add column admin_hidden boolean not null default false,
  add column admin_hidden_reason text;

drop policy products_select on public.products;
create policy products_select on public.products for select to anon, authenticated
  using (
    (status = 'activo' and not admin_hidden
      and exists (select 1 from public.stores s where s.id = store_id and s.status = 'aprobada'))
    or store_id in (select public.tiendas_con_permiso('gestionar_productos'))
    or public.is_admin()
  );

create or replace function public.proteger_producto() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or pg_trigger_depth() > 1 or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.admin_hidden := false;
    new.admin_hidden_reason := null;
  else
    if new.admin_hidden is distinct from old.admin_hidden or new.admin_hidden_reason is distinct from old.admin_hidden_reason then
      raise exception 'Campo reservado a la administración' using errcode = '42501';
    end if;
    if new.store_id is distinct from old.store_id then
      raise exception 'Un producto no se puede pasar a otra tienda' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_products_proteger before insert or update on public.products
  for each row execute function public.proteger_producto();

-- 2) Imágenes: máximo 6 por producto y solo archivos de la carpeta de la propia tienda.
create or replace function public.validar_imagen_producto() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare tienda uuid;
begin
  select store_id into tienda from public.products where id = new.product_id;
  if tienda is null or new.path not like tienda::text || '/%' then
    raise exception 'La imagen debe estar en la carpeta de la tienda del producto' using errcode = '23514';
  end if;
  if (select count(*) from public.product_images where product_id = new.product_id) >= 6 then
    raise exception 'Un producto admite hasta 6 fotos' using errcode = '23514';
  end if;
  -- el orden lo fija el sistema: la primera foto subida es la principal
  new.sort := coalesce((select max(sort) + 1 from public.product_images where product_id = new.product_id), 0);
  return new;
end $$;
create trigger trg_product_images_validar before insert on public.product_images
  for each row execute function public.validar_imagen_producto();

-- 3) Etiquetas siempre en minúsculas y sin espacios sobrantes.
create or replace function public.normalizar_etiqueta() returns trigger
language plpgsql as $$
begin
  new.tag := lower(trim(new.tag));
  return new;
end $$;
create trigger trg_product_tags_normalizar before insert or update on public.product_tags
  for each row execute function public.normalizar_etiqueta();

create index idx_product_images_product on public.product_images (product_id, sort);
create index idx_product_tags_tag on public.product_tags (tag);
create index idx_products_price on public.products (price);
create index idx_stores_location on public.stores (latitude, longitude) where status = 'aprobada';

-- 4) Búsqueda del catálogo público (respeta RLS: se ejecuta con los permisos de quien consulta).
create or replace function public.buscar_productos(
  p_texto text default null,
  p_categoria uuid default null,
  p_precio_min numeric default null,
  p_precio_max numeric default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radio_km double precision default null,
  p_orden text default 'reciente',
  p_limite integer default 24,
  p_desde integer default 0
)
returns table (
  id uuid, name text, description text, price numeric, available boolean,
  category_id uuid, category_name text,
  store_id uuid, store_name text, store_address text, offers_delivery boolean, offers_pickup boolean,
  distancia_km double precision, image_path text, created_at timestamptz
)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_texto text := nullif(trim(p_texto), '');
  v_patron text;
begin
  if v_texto is not null then
    v_patron := '%' || replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select x.id, x.name, x.description, x.price, x.available, x.category_id, x.category_name,
         x.store_id, x.store_name, x.store_address, x.offers_delivery, x.offers_pickup,
         x.distancia_km, x.image_path, x.created_at
  from (
    select p.id, p.name, p.description, p.price, p.available, p.category_id, c.name as category_name,
           s.id as store_id, s.name as store_name, s.address as store_address, s.offers_delivery, s.offers_pickup,
           case when p_lat is not null and p_lng is not null and s.latitude is not null and s.longitude is not null
             then 6371 * 2 * asin(sqrt(least(1,
                    power(sin(radians(s.latitude - p_lat) / 2), 2)
                    + cos(radians(p_lat)) * cos(radians(s.latitude)) * power(sin(radians(s.longitude - p_lng) / 2), 2))))
           end as distancia_km,
           (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.sort, pi.id limit 1) as image_path,
           p.created_at
    from public.products p
    join public.stores s on s.id = p.store_id
    join public.categories c on c.id = p.category_id
    where p.status = 'activo' and not p.admin_hidden and s.status = 'aprobada'
      and (p_categoria is null or p.category_id = p_categoria or c.parent_id = p_categoria)
      and (p_precio_min is null or p.price >= p_precio_min)
      and (p_precio_max is null or p.price <= p_precio_max)
      and (v_texto is null
           or p.search_vector @@ websearch_to_tsquery('spanish', v_texto)
           or p.name ilike v_patron
           or exists (select 1 from public.product_tags t where t.product_id = p.id and t.tag ilike v_patron))
  ) x
  where p_radio_km is null or (x.distancia_km is not null and x.distancia_km <= p_radio_km)
  order by
    case when p_orden = 'precio_asc' then x.price end asc,
    case when p_orden = 'precio_desc' then x.price end desc,
    case when p_orden = 'cerca' then x.distancia_km end asc nulls last,
    x.created_at desc
  limit least(greatest(coalesce(p_limite, 24), 1), 60)
  offset greatest(coalesce(p_desde, 0), 0);
end $$;

grant execute on function public.buscar_productos(text, uuid, numeric, numeric, double precision, double precision, double precision, text, integer, integer)
  to anon, authenticated;
