-- MERCADO EXTRA · Etapa 17 · Resumen y estadísticas del vendedor
create function public.panel_vendedor(p_dias integer default null)
returns table (
  tienda_id uuid, nombre text, estado public.tienda_estado,
  productos bigint, solicitudes bigint, ofertas bigint, pedidos bigint, reclamos bigint,
  pedidos_periodo bigint, completados bigint, cancelados bigint, importe_acordado numeric,
  calificaciones bigint, promedio numeric
)
language sql stable security definer set search_path = public, pg_temp as $$
  with permisos as (
    select
      array(select public.tiendas_con_permiso('gestionar_productos')) as productos,
      array(select public.tiendas_con_permiso('ver_solicitudes', true)) as solicitudes,
      array(select public.tiendas_con_permiso('enviar_ofertas')) as ofertas,
      array(select public.tiendas_con_permiso('gestionar_pedidos')) as pedidos,
      array(select public.tiendas_con_permiso('ver_estadisticas')) as estadisticas
  ), periodo as (
    select case when p_dias in (7, 30, 90) then now() - make_interval(days => p_dias)
      else '-infinity'::timestamptz end as desde
  )
  select s.id, s.name, s.status,
    case when s.id = any(pm.productos) then
      (select count(*) from public.products p where p.store_id = s.id and p.status <> 'eliminado')
    end,
    case when s.id = any(pm.solicitudes) then
      (select count(*) from public.request_matches m join public.requests r on r.id = m.request_id
        where m.store_id = s.id and not m.dismissed and r.status in ('abierta', 'con_ofertas') and r.expires_at > now())
    end,
    case when s.id = any(pm.ofertas) then
      (select count(*) from public.offers f join public.requests r on r.id = f.request_id
        where f.store_id = s.id and f.status = 'enviada' and r.status = 'con_ofertas' and r.expires_at > now())
    end,
    case when s.id = any(pm.pedidos) then
      (select count(*) from public.orders o where o.store_id = s.id and o.status not in ('completada', 'cancelada'))
    end,
    case when s.id = any(pm.pedidos) then
      (select count(*) from public.claims c where c.store_id = s.id and c.status in ('abierto', 'en_revision'))
    end,
    v.total, v.completados, v.cancelados, v.importe, cal.total, cal.promedio
  from public.stores s
  cross join permisos pm
  cross join periodo p
  left join lateral (
    select count(*) as total,
      count(*) filter (where o.status = 'completada') as completados,
      count(*) filter (where o.status = 'cancelada') as cancelados,
      coalesce(sum(o.agreed_price) filter (where o.status = 'completada'), 0) as importe
    from public.orders o
    where o.store_id = s.id and o.created_at >= p.desde
  ) v on s.id = any(pm.estadisticas)
  left join lateral (
    select count(*) as total, round(avg(r.score), 2) as promedio
    from public.ratings r join public.orders o on o.id = r.order_id
    where o.store_id = s.id and r.rater_role = 'comprador' and r.status = 'visible' and r.created_at >= p.desde
  ) cal on s.id = any(pm.estadisticas)
  where auth.uid() is not null and (
    s.owner_id = auth.uid() or exists (
      select 1 from public.store_members m where m.store_id = s.id and m.user_id = auth.uid() and m.status = 'activo'
    )
  )
  order by s.name, s.id
$$;

revoke execute on function public.panel_vendedor(integer) from public, anon;
grant execute on function public.panel_vendedor(integer) to authenticated;
