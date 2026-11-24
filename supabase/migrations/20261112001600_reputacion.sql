-- MERCADO EXTRA · Etapa 13 · Reputación
alter policy ratings_select on public.ratings using (
  rater_id = auth.uid() or rated_id = auth.uid() or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = ratings.order_id
      and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos'))
  )
);

create or replace function public.calificar_pedido(p_order uuid, p_rol public.calificador_rol, p_score smallint, p_comment text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_autor uuid := auth.uid();
  v_destino uuid;
begin
  select case when p_rol = 'comprador' then s.owner_id else o.buyer_id end
    into v_destino
    from public.orders o join public.stores s on s.id = o.store_id
    where o.id = p_order;

  if v_autor is null or not public.cuenta_activa() or v_destino is null
    or v_autor = v_destino or not public.puede_calificar(p_order, v_autor, v_destino, p_rol) then
    raise exception 'No puedes calificar este pedido.';
  end if;

  insert into public.ratings (order_id, rater_id, rater_role, rated_id, score, comment)
    values (p_order, v_autor, p_rol, v_destino, p_score, nullif(btrim(p_comment), ''));
end $$;

revoke all on function public.calificar_pedido(uuid, public.calificador_rol, smallint, text) from public, anon;
grant execute on function public.calificar_pedido(uuid, public.calificador_rol, smallint, text) to authenticated;
revoke insert on public.ratings from authenticated;

drop function if exists public.reputacion_tiendas(uuid[]);
create function public.reputacion_tiendas(p_tiendas uuid[])
returns table (id uuid, calificacion_promedio numeric, total_calificaciones bigint, ventas_completadas bigint, conteo_estrellas bigint[])
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, rep.promedio, rep.total,
    (select count(*) from public.orders o where o.store_id = s.id and o.status = 'completada'), rep.conteo
  from public.stores s
  cross join lateral (
    select round(avg(r.score), 2) as promedio, count(*) as total,
      array[
        count(*) filter (where r.score = 5),
        count(*) filter (where r.score = 4),
        count(*) filter (where r.score = 3),
        count(*) filter (where r.score = 2),
        count(*) filter (where r.score = 1)
      ] as conteo
    from public.ratings r
    join public.orders o on o.id = r.order_id
    where o.store_id = s.id and r.rater_role = 'comprador' and r.status = 'visible'
  ) rep
  where s.id = any(p_tiendas) and (s.status = 'aprobada' or s.id in (select public.tiendas_con_permiso('gestionar_pedidos')))
$$;

revoke all on function public.reputacion_tiendas(uuid[]) from public;
grant execute on function public.reputacion_tiendas(uuid[]) to anon, authenticated;

-- El comprador y las tiendas con un pedido compartido pueden consultar solo el resumen.
drop function if exists public.reputacion_comprador(uuid);
create function public.reputacion_comprador(p_comprador uuid)
returns table (calificacion_promedio numeric, total_calificaciones bigint, conteo_estrellas bigint[])
language sql stable security definer set search_path = public, pg_temp as $$
  select rep.promedio, rep.total, rep.conteo
  from lateral (
    select round(avg(r.score), 2) as promedio, count(*) as total,
      array[
        count(*) filter (where r.score = 5),
        count(*) filter (where r.score = 4),
        count(*) filter (where r.score = 3),
        count(*) filter (where r.score = 2),
        count(*) filter (where r.score = 1)
      ] as conteo
    from public.ratings r
    where r.rated_id = p_comprador and r.rater_role = 'vendedor' and r.status = 'visible'
  ) rep
  where auth.uid() = p_comprador or exists (
    select 1 from public.orders o where o.buyer_id = p_comprador
      and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos'))
  )
$$;
revoke all on function public.reputacion_comprador(uuid) from public, anon;
grant execute on function public.reputacion_comprador(uuid) to authenticated;

-- Reseñas públicas de tiendas aprobadas. Expone puntuación, comentario y fecha.
create or replace function public.resenas_publicas_tienda(p_tienda uuid)
returns table (score smallint, comment text, fecha date)
language sql stable security definer set search_path = public, pg_temp as $$
  with ordenadas as (
    select r.score, r.comment, r.created_at, r.id,
      row_number() over (
        partition by case when r.score <= 2 then 1 when r.score = 3 then 2 else 3 end
        order by r.created_at desc, r.id desc
      ) as posicion
    from public.ratings r
    join public.orders o on o.id = r.order_id
    join public.stores s on s.id = o.store_id
    where s.id = p_tienda and s.status = 'aprobada'
      and r.rater_role = 'comprador' and r.status = 'visible' and nullif(btrim(r.comment), '') is not null
  )
  select r.score, r.comment, (r.created_at at time zone 'America/Lima')::date
  from ordenadas r
  order by (r.posicion = 1) desc, r.created_at desc, r.id desc
  limit 5
$$;
revoke all on function public.resenas_publicas_tienda(uuid) from public;
grant execute on function public.resenas_publicas_tienda(uuid) to anon, authenticated;

drop function if exists public.resenas_publicas_por_estrellas(uuid, integer, integer);
create function public.resenas_publicas_por_estrellas(p_tienda uuid, p_estrellas integer, p_offset integer)
returns table (score smallint, comment text, fecha date, autor text, foto_url text)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.score, r.comment, (r.created_at at time zone 'America/Lima')::date,
    coalesce(nullif(btrim(p.full_name), ''), 'Comprador'),
    case
      when (u.raw_user_meta_data ->> 'avatar_url') ~ '^https://lh[0-9]+[.]googleusercontent[.]com/' then u.raw_user_meta_data ->> 'avatar_url'
      when (u.raw_user_meta_data ->> 'picture') ~ '^https://lh[0-9]+[.]googleusercontent[.]com/' then u.raw_user_meta_data ->> 'picture'
    end
  from public.ratings r
  join public.orders o on o.id = r.order_id
  join public.stores s on s.id = o.store_id
  join public.profiles p on p.id = r.rater_id
  left join auth.users u on u.id = r.rater_id
  where s.id = p_tienda and s.status = 'aprobada'
    and r.rater_role = 'comprador' and r.status = 'visible' and r.score = p_estrellas
    and p_offset >= 0
  order by r.created_at desc, r.id desc
  limit 21 offset greatest(p_offset, 0)
$$;
revoke all on function public.resenas_publicas_por_estrellas(uuid, integer, integer) from public;
grant execute on function public.resenas_publicas_por_estrellas(uuid, integer, integer) to anon, authenticated;

-- Fotos de la contraparte limitadas a pedidos o chats que la cuenta puede consultar.
create or replace function public.fotos_contraparte(p_contexto text, p_ids uuid[])
returns table (referencia uuid, logo_path text, foto_url text, tienda_publica boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with referencias as (
    select o.id, o.buyer_id, o.store_id from public.orders o
      where p_contexto = 'pedido' and o.id = any(p_ids)
        and (o.buyer_id = auth.uid() or o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos')))
    union all
    select c.id, c.buyer_id, c.store_id from public.conversations c
      where p_contexto = 'chat' and c.id = any(p_ids) and public.can_access_conversation(c.id)
  )
  select r.id,
    case when r.buyer_id = auth.uid() then s.logo_path end,
    case when r.buyer_id <> auth.uid() then
      case
        when (u.raw_user_meta_data ->> 'avatar_url') ~ '^https://lh[0-9]+[.]googleusercontent[.]com/' then u.raw_user_meta_data ->> 'avatar_url'
        when (u.raw_user_meta_data ->> 'picture') ~ '^https://lh[0-9]+[.]googleusercontent[.]com/' then u.raw_user_meta_data ->> 'picture'
      end
    end,
    r.buyer_id = auth.uid() and s.status = 'aprobada'
  from referencias r join public.stores s on s.id = r.store_id
  left join auth.users u on u.id = r.buyer_id and r.buyer_id <> auth.uid()
  where auth.uid() is not null and coalesce(cardinality(p_ids), 0) <= 500
$$;
revoke all on function public.fotos_contraparte(text,uuid[]) from public, anon;
grant execute on function public.fotos_contraparte(text,uuid[]) to authenticated;
