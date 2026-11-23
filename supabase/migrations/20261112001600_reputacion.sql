-- MERCADO EXTRA · Etapa 13 · Reputación
alter policy ratings_select on public.ratings using (
  rater_id = auth.uid() or rated_id = auth.uid() or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = ratings.order_id
      and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos'))
      and ratings.rater_role = 'vendedor'
  )
);

create function public.calificar_pedido(p_order uuid, p_rol public.calificador_rol, p_score smallint, p_comment text)
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

create function public.reputacion_tiendas(p_tiendas uuid[])
returns table (id uuid, calificacion_promedio numeric, total_calificaciones bigint, ventas_completadas bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, rep.promedio, rep.total,
    (select count(*) from public.orders o where o.store_id = s.id and o.status = 'completada')
  from public.stores s
  cross join lateral (
    select round(avg(r.score), 2) as promedio, count(*) as total
    from public.ratings r
    join public.orders o on o.id = r.order_id
    where o.store_id = s.id and r.rater_role = 'comprador' and r.status = 'visible'
  ) rep
  where s.id = any(p_tiendas) and s.status = 'aprobada'
$$;

revoke all on function public.reputacion_tiendas(uuid[]) from public;
grant execute on function public.reputacion_tiendas(uuid[]) to anon, authenticated;
