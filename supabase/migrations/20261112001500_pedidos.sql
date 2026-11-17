-- MERCADO EXTRA · Etapa 12 · Pedidos, evidencias fotográficas y código de entrega

alter table public.delivery_codes add column generaciones integer not null default 1;

-- 1) Evidencias: solo antes de enviar (y fotos de entrega en recojo), con límites y carpeta propia.
drop policy delivery_evidence_insert on public.delivery_evidence;
create policy delivery_evidence_insert on public.delivery_evidence for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos', true))
        and (o.status in ('compra_coordinada', 'en_preparacion')
             or (type = 'recojo' and o.status in ('enviado_o_listo', 'pendiente_confirmacion')))
    )
  );
create policy delivery_evidence_delete on public.delivery_evidence for delete to authenticated
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.status in ('compra_coordinada', 'en_preparacion')
        and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos', true))
    )
  );

create or replace function public.validar_evidencia() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() then return new; end if;
  if new.file_path not like new.order_id::text || '/%' then
    raise exception 'La foto debe estar en la carpeta del pedido' using errcode = '23514';
  end if;
  if (select count(*) from public.delivery_evidence e where e.order_id = new.order_id and e.type = new.type) >= 3 then
    raise exception 'Máximo 3 fotos por tipo de evidencia' using errcode = '23514';
  end if;
  if (select count(*) from public.delivery_evidence e where e.order_id = new.order_id) >= 15 then
    raise exception 'Máximo 15 fotos por pedido' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_evidencia_validar before insert on public.delivery_evidence
  for each row execute function public.validar_evidencia();

drop policy "evidencia_subir" on storage.objects;
create policy "evidencia_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-evidence' and exists (
    select 1 from public.orders o
    where o.id = public.try_uuid((storage.foldername(name))[1])
      and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos', true))
      and o.status in ('compra_coordinada', 'en_preparacion', 'enviado_o_listo', 'pendiente_confirmacion')));
create policy "evidencia_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'delivery-evidence' and exists (
    select 1 from public.orders o
    where o.id = public.try_uuid((storage.foldername(name))[1])
      and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos', true))
      and o.status in ('compra_coordinada', 'en_preparacion')));

-- 2) Código de entrega de 6 dígitos (aleatorio fuerte: se deriva de gen_random_uuid).
create or replace function public.nuevo_codigo() returns text
language sql volatile set search_path = public, pg_temp as $$
  select lpad((((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::bigint) % 900000) + 100000)::text, 6, '0')
$$;

create or replace function public.etiqueta_estado_pedido(p_estado public.pedido_estado, p_modo public.entrega_modo) returns text
language sql immutable as $$
  select case p_estado
    when 'oferta_aceptada' then 'Oferta aceptada'
    when 'compra_coordinada' then 'Compra coordinada'
    when 'en_preparacion' then 'En preparación'
    when 'evidencias_registradas' then 'Evidencias registradas'
    when 'enviado_o_listo' then case when p_modo = 'recojo' then 'Listo para recojo' else 'Enviado' end
    when 'pendiente_confirmacion' then 'Entrega en curso'
    when 'entregado' then 'Entregado'
    when 'completada' then 'Operación completada'
    else 'Cancelado' end
$$;

-- (re)genera el código; la 3.ª regeneración es la última.
create or replace function public.generar_codigo_entrega(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actual integer;
begin
  select generaciones into v_actual from public.delivery_codes where order_id = p_order;
  if v_actual is not null and v_actual >= 3 then
    raise exception 'Ya se generaron los 3 códigos permitidos para este pedido' using errcode = '22023';
  end if;
  insert into public.delivery_codes (order_id, code, expires_at, generaciones)
  values (p_order, public.nuevo_codigo(), now() + interval '7 days', 1)
  on conflict (order_id) do update
    set code = excluded.code, expires_at = excluded.expires_at, used_at = null, attempts = 0, locked_until = null,
        generaciones = public.delivery_codes.generaciones + 1;
end $$;
revoke all on function public.generar_codigo_entrega(uuid) from public, anon, authenticated;

-- 3) La tienda avanza el pedido paso a paso (no se pueden saltar pasos).
create or replace function public.avanzar_pedido(p_order uuid, p_estado public.pedido_estado) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare od public.orders; v_titulo text; v_tienda text; v_tipos integer; v_total integer; v_msg text;
begin
  if auth.uid() is null or not public.cuenta_activa() then
    raise exception 'Debes iniciar sesión con una cuenta activa' using errcode = '42501';
  end if;
  select * into od from public.orders where id = p_order for update;
  if not found then raise exception 'Pedido no encontrado' using errcode = 'P0002'; end if;
  if od.store_id not in (select public.tiendas_con_permiso('gestionar_pedidos', true)) then
    raise exception 'No tienes permiso para gestionar este pedido' using errcode = '42501';
  end if;
  if not (
       (od.status = 'oferta_aceptada' and p_estado = 'compra_coordinada')
    or (od.status = 'compra_coordinada' and p_estado = 'en_preparacion')
    or (od.status = 'en_preparacion' and p_estado = 'evidencias_registradas')
    or (od.status = 'en_preparacion' and p_estado = 'enviado_o_listo' and od.delivery_mode = 'recojo')
    or (od.status = 'evidencias_registradas' and p_estado = 'enviado_o_listo')
    or (od.status = 'enviado_o_listo' and p_estado = 'pendiente_confirmacion')
  ) then
    raise exception 'Ese cambio de estado no está permitido desde el estado actual' using errcode = '22023';
  end if;

  if p_estado = 'evidencias_registradas' then
    select count(distinct e.type) filter (where e.type in ('producto_completo', 'detalle_estado', 'producto_en_paquete', 'paquete_cerrado')), count(*)
      into v_tipos, v_total from public.delivery_evidence e where e.order_id = p_order;
    if od.delivery_mode = 'domicilio' and v_tipos < 4 then
      raise exception 'Faltan fotos obligatorias: producto completo, detalles y estado, producto dentro del paquete y paquete cerrado (%/4)', v_tipos using errcode = '22023';
    end if;
    if od.delivery_mode = 'recojo' and v_total < 1 then
      raise exception 'Sube al menos una foto del producto' using errcode = '22023';
    end if;
  end if;

  update public.orders set status = p_estado where id = p_order;
  insert into public.delivery_events (order_id, event, from_status, to_status, actor_id) values (p_order, 'estado', od.status, p_estado, auth.uid());

  select r.title into v_titulo from public.requests r where r.id = od.request_id;
  select s.name into v_tienda from public.stores s where s.id = od.store_id;
  if p_estado = 'enviado_o_listo' then
    perform public.generar_codigo_entrega(p_order);
    insert into public.notifications (user_id, type, title, body, payload)
    values (od.buyer_id, 'codigo_entrega', 'Tu código de entrega está listo',
            v_tienda || ' ' || case when od.delivery_mode = 'recojo' then 'tiene listo' else 'envió' end || ' «' || v_titulo || '». Entrega el código al vendedor SOLO cuando tengas el producto en tus manos.',
            jsonb_build_object('order_id', p_order, 'request_id', od.request_id, 'para', 'comprador'));
  else
    v_msg := public.etiqueta_estado_pedido(p_estado, od.delivery_mode);
    insert into public.notifications (user_id, type, title, body, payload)
    values (od.buyer_id, 'pedido_estado', 'Tu pedido: ' || v_msg, v_tienda || ' · «' || v_titulo || '»',
            jsonb_build_object('order_id', p_order, 'request_id', od.request_id, 'para', 'comprador'));
  end if;
end $$;

-- 4) El comprador ve su código (nadie más; el vendedor jamás lo ve antes de la entrega).
create or replace function public.obtener_codigo_entrega(p_order uuid)
returns table (codigo text, vence timestamptz, intentos integer, bloqueado_hasta timestamptz, generaciones integer, usado boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare od public.orders;
begin
  select * into od from public.orders where id = p_order;
  if not found or od.buyer_id is distinct from auth.uid() then
    raise exception 'No tienes acceso a este pedido' using errcode = '42501';
  end if;
  if od.status not in ('enviado_o_listo', 'pendiente_confirmacion', 'entregado', 'completada') then
    raise exception 'El código estará disponible cuando el pedido sea enviado o esté listo para recojo' using errcode = '22023';
  end if;
  return query
    select case when dc.used_at is null then dc.code else null end, dc.expires_at, dc.attempts, dc.locked_until, dc.generaciones, dc.used_at is not null
    from public.delivery_codes dc where dc.order_id = p_order;
end $$;

-- 5) La tienda confirma la entrega con el código. Devuelve el resultado (no lanza error en los intentos fallidos
--    para que cada intento quede registrado). Límites: 5 fallos = 15 min, 10 = 1 h, 15 = bloqueado hasta nuevo código.
create or replace function public.confirmar_entrega(p_order uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare od public.orders; dc public.delivery_codes; v_fallidos integer; v_titulo text; v_tienda text; v_intentos integer; v_bloq timestamptz;
begin
  if auth.uid() is null or not public.cuenta_activa() then
    raise exception 'Debes iniciar sesión con una cuenta activa' using errcode = '42501';
  end if;
  select * into od from public.orders where id = p_order for update;
  if not found then raise exception 'Pedido no encontrado' using errcode = 'P0002'; end if;
  if od.store_id not in (select public.tiendas_con_permiso('gestionar_pedidos', true)) then
    raise exception 'No tienes permiso para confirmar entregas de este pedido' using errcode = '42501';
  end if;
  if od.status not in ('enviado_o_listo', 'pendiente_confirmacion') then
    raise exception 'El pedido no está listo para confirmar la entrega' using errcode = '22023';
  end if;
  if p_codigo is null or p_codigo !~ '^[0-9]{6}$' then
    return jsonb_build_object('resultado', 'formato');
  end if;

  select count(*) into v_fallidos from public.delivery_code_attempts a
   where a.user_id = auth.uid() and not a.success and a.attempted_at > now() - interval '1 hour';
  if v_fallidos >= 20 then
    return jsonb_build_object('resultado', 'bloqueado', 'motivo', 'persona', 'bloqueado_hasta', now() + interval '1 hour');
  end if;

  select * into dc from public.delivery_codes where order_id = p_order for update;
  if not found then return jsonb_build_object('resultado', 'sin_codigo'); end if;
  if dc.attempts >= 15 then
    return jsonb_build_object('resultado', 'bloqueado', 'motivo', 'regenerar');
  end if;
  if dc.locked_until is not null and dc.locked_until > now() then
    return jsonb_build_object('resultado', 'bloqueado', 'motivo', 'intentos', 'bloqueado_hasta', dc.locked_until);
  end if;
  if dc.expires_at <= now() then
    return jsonb_build_object('resultado', 'vencido');
  end if;

  if dc.code = p_codigo then
    update public.delivery_codes set used_at = now() where order_id = p_order;
    insert into public.delivery_code_attempts (order_id, user_id, success) values (p_order, auth.uid(), true);
    update public.orders set status = 'entregado' where id = p_order;
    insert into public.delivery_events (order_id, event, from_status, to_status, actor_id) values (p_order, 'entrega_confirmada', od.status, 'entregado', auth.uid());
    select r.title into v_titulo from public.requests r where r.id = od.request_id;
    select s.name into v_tienda from public.stores s where s.id = od.store_id;
    insert into public.notifications (user_id, type, title, body, payload)
    values (od.buyer_id, 'entrega_confirmada', 'Entrega confirmada', '«' || v_titulo || '» fue entregado por ' || v_tienda || '. Ya puedes calificar la compra.',
            jsonb_build_object('order_id', p_order, 'request_id', od.request_id, 'para', 'comprador'));
    return jsonb_build_object('resultado', 'correcto');
  end if;

  update public.delivery_codes
     set attempts = attempts + 1,
         locked_until = case attempts + 1 when 5 then now() + interval '15 minutes' when 10 then now() + interval '1 hour'
                                          when 15 then now() + interval '30 days' else locked_until end
   where order_id = p_order
  returning attempts, locked_until into v_intentos, v_bloq;
  insert into public.delivery_code_attempts (order_id, user_id, success) values (p_order, auth.uid(), false);
  return jsonb_build_object(
    'resultado', case when v_bloq is not null and v_bloq > now() then 'bloqueado' else 'incorrecto' end,
    'motivo', case when v_intentos >= 15 then 'regenerar' else 'intentos' end,
    'intentos_restantes', greatest(0, ((v_intentos / 5) + 1) * 5 - v_intentos),
    'bloqueado_hasta', case when v_bloq is not null and v_bloq > now() and v_intentos < 15 then v_bloq else null end);
end $$;

-- 6) El comprador puede generar un código nuevo (máximo 3 por pedido); el anterior deja de servir.
create or replace function public.regenerar_codigo_entrega(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare od public.orders;
begin
  select * into od from public.orders where id = p_order for update;
  if not found or od.buyer_id is distinct from auth.uid() then
    raise exception 'No tienes acceso a este pedido' using errcode = '42501';
  end if;
  if od.status not in ('enviado_o_listo', 'pendiente_confirmacion') then
    raise exception 'Solo se puede generar un código mientras el pedido espera la entrega' using errcode = '22023';
  end if;
  perform public.generar_codigo_entrega(p_order);
  insert into public.delivery_events (order_id, event, actor_id) values (p_order, 'codigo_regenerado', auth.uid());
end $$;

-- 7) El comprador cierra la operación una vez entregado.
create or replace function public.completar_pedido(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare od public.orders; v_titulo text;
begin
  select * into od from public.orders where id = p_order for update;
  if not found or od.buyer_id is distinct from auth.uid() then
    raise exception 'No tienes acceso a este pedido' using errcode = '42501';
  end if;
  if od.status <> 'entregado' then
    raise exception 'Solo se completa un pedido que ya fue entregado' using errcode = '22023';
  end if;
  update public.orders set status = 'completada' where id = p_order;
  insert into public.delivery_events (order_id, event, from_status, to_status, actor_id) values (p_order, 'estado', 'entregado', 'completada', auth.uid());
  select r.title into v_titulo from public.requests r where r.id = od.request_id;
  insert into public.notifications (user_id, type, title, body, payload)
  select distinct q.u, 'pedido_estado', 'Operación completada', 'El comprador cerró la operación de «' || v_titulo || '».',
         jsonb_build_object('order_id', p_order, 'request_id', od.request_id, 'para', 'vendedor')
  from public.usuarios_con_permiso(od.store_id, 'gestionar_pedidos') as q(u);
end $$;

-- 8) Lista de pedidos de la persona (como comprador o como vendedor).
create or replace function public.mis_pedidos() returns table (
  order_id uuid, request_id uuid, solicitud text, store_id uuid, tienda text, buyer_id uuid, comprador text,
  estado text, modo text, precio numeric, creado timestamptz, actualizado timestamptz, mi_rol text, conversation_id uuid,
  fotos_obligatorias integer, fotos_total integer, codigo_generado boolean, codigo_usado boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id, o.request_id, r.title, o.store_id, s.name, o.buyer_id, split_part(p.full_name, ' ', 1),
         o.status::text, o.delivery_mode::text, o.agreed_price, o.created_at, o.updated_at,
         case when o.buyer_id = auth.uid() then 'comprador' else 'vendedor' end,
         (select c.id from public.conversations c where c.order_id = o.id limit 1),
         (select count(distinct e.type)::int from public.delivery_evidence e
            where e.order_id = o.id and e.type in ('producto_completo', 'detalle_estado', 'producto_en_paquete', 'paquete_cerrado')),
         (select count(*)::int from public.delivery_evidence e where e.order_id = o.id),
         exists (select 1 from public.delivery_codes d where d.order_id = o.id),
         coalesce((select d.used_at is not null from public.delivery_codes d where d.order_id = o.id), false)
  from public.orders o
  join public.requests r on r.id = o.request_id
  join public.stores s on s.id = o.store_id
  join public.profiles p on p.id = o.buyer_id
  where auth.uid() is not null
    and (o.buyer_id = auth.uid() or o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos')))
  order by o.updated_at desc
$$;

revoke all on function public.avanzar_pedido(uuid, public.pedido_estado) from public, anon;
revoke all on function public.obtener_codigo_entrega(uuid) from public, anon;
revoke all on function public.confirmar_entrega(uuid, text) from public, anon;
revoke all on function public.regenerar_codigo_entrega(uuid) from public, anon;
revoke all on function public.completar_pedido(uuid) from public, anon;
revoke all on function public.mis_pedidos() from public, anon;
grant execute on function public.avanzar_pedido(uuid, public.pedido_estado) to authenticated;
grant execute on function public.obtener_codigo_entrega(uuid) to authenticated;
grant execute on function public.confirmar_entrega(uuid, text) to authenticated;
grant execute on function public.regenerar_codigo_entrega(uuid) to authenticated;
grant execute on function public.completar_pedido(uuid) to authenticated;
grant execute on function public.mis_pedidos() to authenticated;
