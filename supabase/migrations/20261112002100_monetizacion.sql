-- MERCADO EXTRA · Etapa 16 · Planes y promociones opcionales
alter type public.suscripcion_estado add value if not exists 'pendiente';
alter type public.promocion_estado add value if not exists 'rechazada';

begin;

alter table public.subscription_plans add column if not exists max_promociones integer not null default 1
  check (max_promociones between 1 and 20);
alter table public.subscriptions add column if not exists precio_acordado numeric(12,2);
alter table public.subscriptions add column if not exists decision text;
alter table public.subscriptions add column if not exists max_promociones_acordadas integer check (max_promociones_acordadas between 1 and 20);
alter table public.promotions add column if not exists dias integer not null default 7 check (dias in (7, 14, 30));
alter table public.promotions add column if not exists decision text;

revoke insert, update, delete on public.promotions, public.subscriptions from authenticated;
-- El catálogo recibe únicamente identificadores, sin los motivos internos de revisión.
alter policy promotions_select on public.promotions to authenticated using (
  store_id in (select public.tiendas_con_permiso('gestionar_planes')) or public.is_admin()
);
revoke select on public.promotions from anon;

drop policy if exists plans_select_contratados on public.subscription_plans;
create policy plans_select_contratados on public.subscription_plans for select to authenticated using (
  exists (select 1 from public.subscriptions s where s.plan_id = subscription_plans.id)
);

create index if not exists idx_subscriptions_store on public.subscriptions (store_id, status, ends_at);
create index if not exists idx_promotions_store on public.promotions (store_id, status, ends_at);
create index if not exists idx_promotions_product on public.promotions (product_id) where product_id is not null;

create or replace function public.admin_guardar_plan(p_id uuid, p_nombre text, p_precio numeric, p_maximo integer, p_activo boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := p_id;
begin
  if not public.is_admin() then raise exception 'Solo la administración puede gestionar planes.' using errcode = '42501'; end if;
  if coalesce(char_length(btrim(p_nombre)), 0) not between 2 and 100 or p_precio is null
    or p_precio < 0 or p_precio > 9999999999.99 or p_maximo is null or p_maximo not between 1 and 20 or p_activo is null then
    raise exception 'Revisa el nombre, el precio y el límite de promociones.';
  end if;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.subscription_plans (id, code, name, price_month, max_promociones, active)
      values (v_id, v_id::text, btrim(p_nombre), p_precio, p_maximo, p_activo);
  else
    update public.subscription_plans set name = btrim(p_nombre), price_month = p_precio,
      max_promociones = p_maximo, active = p_activo where id = v_id;
    if not found then raise exception 'El plan no existe.'; end if;
  end if;
  perform public.registrar_auditoria('guardar_plan_comercial', 'subscription_plans', v_id::text);
  return v_id;
end $$;

create or replace function public.solicitar_plan_comercial(p_tienda uuid, p_plan uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_precio numeric;
  v_maximo integer;
begin
  if not exists (select 1 from public.tiendas_con_permiso('gestionar_planes', true) t(id) where t.id = p_tienda) then
    raise exception 'Solo puedes solicitar planes para una tienda aprobada que administras.' using errcode = '42501';
  end if;
  perform 1 from public.stores where id = p_tienda and status = 'aprobada' for update;
  if not found then raise exception 'La tienda debe estar aprobada.'; end if;
  select price_month, max_promociones into v_precio, v_maximo from public.subscription_plans where id = p_plan and active for share;
  if not found then raise exception 'El plan ya no está disponible.'; end if;
  if exists (select 1 from public.subscriptions where store_id = p_tienda
    and (status = 'pendiente' or (status = 'activa' and (ends_at is null or ends_at > now())))) then
    raise exception 'La tienda ya tiene un plan vigente o una solicitud pendiente.';
  end if;
  insert into public.subscriptions (store_id, plan_id, status, precio_acordado, max_promociones_acordadas)
    values (p_tienda, p_plan, 'pendiente', v_precio, v_maximo);
end $$;

create or replace function public.decidir_plan_comercial(p_id uuid, p_accion text, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_fila public.subscriptions%rowtype;
begin
  select * into v_fila from public.subscriptions where id = p_id for update;
  if not found then raise exception 'Solicitud de plan no disponible.'; end if;
  if p_accion = 'retirar' then
    if not exists (select 1 from public.tiendas_con_permiso('gestionar_planes') t(id) where t.id = v_fila.store_id)
      or v_fila.status <> 'pendiente' then raise exception 'Solo puedes retirar una solicitud pendiente de tu tienda.'; end if;
    update public.subscriptions set status = 'cancelada', decision = 'Retirada por la tienda' where id = p_id;
    return;
  end if;
  if not public.is_admin() then raise exception 'Solo la administración puede decidir esta solicitud.' using errcode = '42501'; end if;
  if p_accion not in ('activar', 'rechazar', 'finalizar') or p_accion is null
    or coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 1000 then
    raise exception 'Indica una decisión y su motivo.';
  end if;
  if p_accion = 'finalizar' then
    if v_fila.status <> 'activa' or v_fila.ends_at <= now() then raise exception 'El plan ya no está vigente.'; end if;
    update public.subscriptions set status = 'cancelada', ends_at = now(), decision = btrim(p_motivo) where id = p_id;
  else
    if v_fila.status <> 'pendiente' then raise exception 'La solicitud ya fue revisada.'; end if;
    if p_accion = 'activar' then
      if not exists (select 1 from public.stores where id = v_fila.store_id and status = 'aprobada')
        or not exists (select 1 from public.subscription_plans where id = v_fila.plan_id and active) then
        raise exception 'La tienda debe estar aprobada y el plan disponible.';
      end if;
      update public.subscriptions set status = 'activa', starts_at = now(), ends_at = now() + interval '1 month',
        decision = btrim(p_motivo) where id = p_id;
    else
      update public.subscriptions set status = 'cancelada', decision = btrim(p_motivo) where id = p_id;
    end if;
  end if;
  perform public.registrar_auditoria('decidir_plan_comercial', 'subscriptions', p_id::text, jsonb_build_object('accion', p_accion, 'motivo', btrim(p_motivo)));
end $$;

create or replace function public.solicitar_promocion(p_tienda uuid, p_producto uuid, p_dias integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_maximo integer;
begin
  if p_dias is null or p_dias not in (7, 14, 30) then raise exception 'Selecciona una duración válida.'; end if;
  if not exists (select 1 from public.tiendas_con_permiso('gestionar_planes', true) t(id) where t.id = p_tienda) then
    raise exception 'Solo puedes solicitar promociones para una tienda aprobada que administras.' using errcode = '42501';
  end if;
  perform 1 from public.stores where id = p_tienda and status = 'aprobada' for update;
  if not found then raise exception 'La tienda debe estar aprobada.'; end if;
  if p_producto is not null and not exists (
    select 1 from public.products where id = p_producto and store_id = p_tienda and status = 'activo' and not admin_hidden
  ) then raise exception 'Selecciona un producto publicado de esa tienda.'; end if;
  select coalesce(max(coalesce(s.max_promociones_acordadas, p.max_promociones)), 1) into v_maximo
    from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
    where s.store_id = p_tienda and s.status = 'activa' and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now());
  if (select count(*) from public.promotions where store_id = p_tienda
    and (status = 'pendiente' or (status = 'activa' and (ends_at is null or ends_at > now())))) >= v_maximo then
    raise exception 'Alcanzaste el límite de promociones pendientes o vigentes de esta tienda.';
  end if;
  if exists (select 1 from public.promotions where store_id = p_tienda and product_id is not distinct from p_producto
    and (status = 'pendiente' or (status = 'activa' and (ends_at is null or ends_at > now())))) then
    raise exception 'El producto o la tienda ya tiene una promoción pendiente o vigente.';
  end if;
  insert into public.promotions (store_id, product_id, kind, dias)
    values (p_tienda, p_producto, case when p_producto is null then 'tienda_destacada' else 'producto_destacado' end, p_dias);
end $$;

create or replace function public.decidir_promocion(p_id uuid, p_accion text, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_fila public.promotions%rowtype;
begin
  select * into v_fila from public.promotions where id = p_id for update;
  if not found then raise exception 'Promoción no disponible.'; end if;
  if p_accion = 'retirar' then
    if not exists (select 1 from public.tiendas_con_permiso('gestionar_planes') t(id) where t.id = v_fila.store_id)
      or v_fila.status not in ('pendiente', 'activa') or v_fila.ends_at <= now() then
      raise exception 'Solo puedes retirar promociones pendientes o vigentes de tu tienda.';
    end if;
    update public.promotions set status = 'pausada', decision = 'Retirada por la tienda' where id = p_id;
    return;
  end if;
  if not public.is_admin() then raise exception 'Solo la administración puede revisar promociones.' using errcode = '42501'; end if;
  if p_accion not in ('activar', 'rechazar', 'pausar') or p_accion is null
    or coalesce(char_length(btrim(p_motivo)), 0) not between 5 and 1000 then
    raise exception 'Indica una decisión y su motivo.';
  end if;
  if p_accion = 'pausar' then
    if v_fila.status <> 'activa' or v_fila.ends_at <= now() then raise exception 'La promoción ya no está vigente.'; end if;
    update public.promotions set status = 'pausada', decision = btrim(p_motivo) where id = p_id;
  else
    if v_fila.status <> 'pendiente' then raise exception 'La promoción ya fue revisada.'; end if;
    if p_accion = 'activar' then
      if not exists (select 1 from public.stores where id = v_fila.store_id and status = 'aprobada')
        or (v_fila.product_id is not null and not exists (select 1 from public.products
          where id = v_fila.product_id and store_id = v_fila.store_id and status = 'activo' and not admin_hidden)) then
        raise exception 'La tienda debe estar aprobada y el producto debe seguir publicado.';
      end if;
      update public.promotions set status = 'activa', starts_at = now(),
        ends_at = now() + make_interval(days => v_fila.dias), decision = btrim(p_motivo) where id = p_id;
    else
      update public.promotions set status = 'rechazada', decision = btrim(p_motivo) where id = p_id;
    end if;
  end if;
  perform public.registrar_auditoria('decidir_promocion', 'promotions', p_id::text, jsonb_build_object('accion', p_accion, 'motivo', btrim(p_motivo)));
end $$;

create or replace function public.catalogo_promocionado(p_tiendas uuid[], p_productos uuid[])
returns table (store_id uuid, product_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct f.store_id, f.product_id
  from public.promotions f
  join public.stores s on s.id = f.store_id and s.status = 'aprobada'
  left join public.products p on p.id = f.product_id and p.store_id = s.id
  where f.status = 'activa' and (f.starts_at is null or f.starts_at <= now())
    and (f.ends_at is null or f.ends_at > now()) and (
      (f.kind = 'tienda_destacada' and f.product_id is null and f.store_id = any(p_tiendas))
      or (f.kind = 'producto_destacado' and p.id = any(p_productos) and p.status = 'activo' and not p.admin_hidden)
    )
$$;

revoke execute on function public.admin_guardar_plan(uuid, text, numeric, integer, boolean),
  public.solicitar_plan_comercial(uuid, uuid), public.decidir_plan_comercial(uuid, text, text),
  public.solicitar_promocion(uuid, uuid, integer), public.decidir_promocion(uuid, text, text) from public, anon;
grant execute on function public.admin_guardar_plan(uuid, text, numeric, integer, boolean),
  public.solicitar_plan_comercial(uuid, uuid), public.decidir_plan_comercial(uuid, text, text),
  public.solicitar_promocion(uuid, uuid, integer), public.decidir_promocion(uuid, text, text) to authenticated;
revoke execute on function public.catalogo_promocionado(uuid[], uuid[]) from public;
grant execute on function public.catalogo_promocionado(uuid[], uuid[]) to anon, authenticated;

commit;
