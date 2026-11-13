-- MERCADO EXTRA · Etapa 4 · Pruebas de permisos (RLS) con usuarios FICTICIOS
\set ON_ERROR_STOP on
\o /dev/null

create schema t;
grant usage on schema t to public;
create table t.results (n serial primary key, name text, ok boolean);

create function t.u(n int) returns uuid language sql immutable as
  $$ select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function t.root() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claim.email', '', false);
end $$;
create function t.como(uid uuid) returns void language plpgsql as $$
declare e text;
begin
  reset role;
  select email into e from auth.users where id = uid;
  perform set_config('request.jwt.claim.sub', uid::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.email', coalesce(e, ''), false);
  set role authenticated;
end $$;
create function t.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
  set role anon;
end $$;
create function t.ok(cond boolean, nombre text) returns void language plpgsql security definer as $$
begin
  insert into t.results (name, ok) values (nombre, coalesce(cond, false));
  if not coalesce(cond, false) then raise notice 'FALLA: %', nombre; end if;
end $$;
-- cuenta filas visibles
create function t.n(q text) returns bigint language plpgsql as $$
declare r bigint;
begin
  execute 'select count(*) from (' || q || ') x' into r;
  return r;
end $$;
-- true si la sentencia falla (error de permiso, restricción o disparador)
create function t.falla(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  return true;
end $$;
-- filas afectadas (-1 si dio error)
create function t.afecta(q text) returns int language plpgsql as $$
declare r int;
begin
  execute q;
  get diagnostics r = row_count;
  return r;
exception when others then
  return -1;
end $$;

-- ═════════ DATOS DE PRUEBA (todo ficticio) ═════════
select t.root();
insert into auth.users (id, email, raw_user_meta_data) values
  (t.u(1), 'ana.compradora@prueba.test',  '{"full_name":"Ana Compradora"}'),
  (t.u(2), 'beto.comprador@prueba.test',  '{"full_name":"Beto Comprador"}'),
  (t.u(3), 'carla.moda@prueba.test',      '{"full_name":"Carla Moda"}'),
  (t.u(4), 'dario.ferreteria@prueba.test','{"full_name":"Dario Ferreteria"}'),
  (t.u(5), 'eva.vendedora@prueba.test',   '{"full_name":"Eva Vendedora"}'),
  (t.u(6), 'fito.productos@prueba.test',  '{"full_name":"Fito Productos"}'),
  (t.u(7), 'zoe.admin@prueba.test',       '{"full_name":"Zoe Admin"}'),
  (t.u(8), 'hugo.revocado@prueba.test',   '{"full_name":"Hugo Revocado"}'),
  (t.u(9), 'ines.suspendida@prueba.test', '{"full_name":"Ines Suspendida"}'),
  (t.u(10), 'nuevo.empleado@prueba.test', '{"full_name":"Nora Nueva"}'),
  (t.u(11), 'admin.tienda@prueba.test', '{"full_name":"Alma Admintienda"}');
update public.profiles set is_admin = true where id = t.u(7);
update public.profiles set status = 'suspendido' where id = t.u(9);

insert into public.stores (id, owner_id, name, status, offers_delivery, offers_pickup) values
  (t.u(101), t.u(3), 'Moda Andina (prueba)', 'aprobada', true, true),
  (t.u(102), t.u(4), 'Ferretería El Tornillo (prueba)', 'aprobada', true, true),
  (t.u(103), t.u(4), 'Tienda pendiente (prueba)', 'pendiente', false, true);
insert into public.store_members (store_id, user_id, role_code, status) values
  (t.u(101), t.u(5), 'vendedor', 'activo'),
  (t.u(101), t.u(6), 'encargado_productos', 'activo'),
  (t.u(101), t.u(8), 'vendedor', 'revocado');

insert into public.products (id, store_id, category_id, name, price, status) values
  (t.u(201), t.u(101), (select id from public.categories where slug = 'ropa'), 'Saco negro talla M', 149, 'activo'),
  (t.u(202), t.u(102), (select id from public.categories where slug = 'ferreteria'), 'Taladro percutor', 219, 'activo'),
  (t.u(203), t.u(101), (select id from public.categories where slug = 'ropa'), 'Producto oculto', 10, 'oculto');

insert into public.requests (id, buyer_id, title, category_id, max_budget, status, expires_at) values
  (t.u(301), t.u(1), 'Saco negro talla M', (select id from public.categories where slug = 'ropa'), 200, 'abierta', now() + interval '20 hours'),
  (t.u(302), t.u(1), 'Pedido entregado', (select id from public.categories where slug = 'ropa'), 150, 'atendida', now() + interval '1 hour'),
  (t.u(303), t.u(1), 'Pedido en preparación', (select id from public.categories where slug = 'ropa'), 150, 'atendida', now() + interval '1 hour'),
  (t.u(304), t.u(1), 'Solicitud vencida', (select id from public.categories where slug = 'ropa'), 100, 'vencida', now() - interval '1 hour'),
  (t.u(305), t.u(1), 'Abierta pero con plazo pasado', (select id from public.categories where slug = 'ropa'), 100, 'abierta', now() - interval '1 hour'),
  (t.u(306), t.u(1), 'Abierta para probar permisos', (select id from public.categories where slug = 'ropa'), 100, 'abierta', now() + interval '10 hours');
insert into public.request_matches (request_id, store_id) values
  (t.u(301), t.u(101)), (t.u(305), t.u(101)), (t.u(306), t.u(101));

insert into public.offers (id, request_id, store_id, created_by) values
  (t.u(401), t.u(302), t.u(101), t.u(3)), (t.u(402), t.u(303), t.u(101), t.u(3));
insert into public.offer_history (offer_id, price, created_by) values
  (t.u(401), 149, t.u(3)), (t.u(402), 149, t.u(3));
insert into public.orders (id, request_id, offer_version_id, buyer_id, store_id, delivery_mode, status, agreed_price) values
  (t.u(501), t.u(302), (select current_version_id from public.offers where id = t.u(401)), t.u(1), t.u(101), 'domicilio', 'entregado', 149),
  (t.u(502), t.u(303), (select current_version_id from public.offers where id = t.u(402)), t.u(1), t.u(101), 'domicilio', 'en_preparacion', 149);
insert into public.conversations (id, request_id, offer_id, order_id, store_id, buyer_id)
  values (t.u(601), t.u(302), t.u(401), t.u(501), t.u(101), t.u(1));
insert into public.messages (conversation_id, sender_id, body) values (t.u(601), t.u(1), 'Hola, ¿tienen talla M?');
insert into public.delivery_codes (order_id, code, expires_at) values (t.u(501), '123456', now() + interval '1 day');
insert into public.delivery_events (order_id, event, to_status, actor_id) values (t.u(501), 'entregado', 'entregado', t.u(3));
insert into public.notifications (user_id, type, title) values (t.u(1), 'prueba', 'Aviso para Ana'), (t.u(2), 'prueba', 'Aviso para Beto');
insert into public.identity_verifications (user_id, dni) values (t.u(1), '12345678'), (t.u(3), '87654321');
insert into storage.objects (bucket_id, name) values
  ('identity-private', t.u(1)::text || '/dni.jpg'),
  ('identity-private', t.u(3)::text || '/dni.jpg'),
  ('chat-private', t.u(601)::text || '/foto.jpg'),
  ('delivery-evidence', t.u(501)::text || '/paquete.jpg'),
  ('public-catalog', t.u(101)::text || '/logo.png');

-- ═════════ PRUEBAS ═════════
-- 1. Visitante sin sesión
select t.anon();
select t.ok(t.n('select 1 from public.stores') = 2, 'visitante ve solo tiendas aprobadas');
select t.ok(t.n('select 1 from public.products') = 2, 'visitante ve productos activos de tiendas aprobadas (no los ocultos)');
select t.ok(t.falla('select 1 from public.profiles'), 'visitante no puede leer perfiles');
select t.ok(t.falla('select 1 from public.requests'), 'visitante no puede leer solicitudes');
select t.ok(t.falla('select 1 from public.identity_verifications'), 'visitante no puede leer verificaciones de identidad');
select t.ok(t.falla($q$insert into public.categories (name, slug) values ('Hack', 'hack')$q$), 'visitante no puede crear categorías');

-- 2. Perfiles e identidad
select t.como(t.u(1));
select t.ok(t.n(format('select 1 from public.identity_verifications where user_id = %L', t.u(3))) = 0, 'comprador no ve el DNI de otro usuario');
select t.ok(t.n(format('select 1 from public.identity_verifications where user_id = %L', t.u(1))) = 1, 'comprador ve su propia verificación');
select t.ok(t.n(format('select 1 from public.profiles where id = %L', t.u(3))) = 0, 'comprador no lee el perfil completo de otro');
select t.ok(t.n(format('select 1 from public.perfiles_publicos where id = %L', t.u(3))) = 1, 'comprador ve el perfil público reducido de otro');
select t.ok(t.falla(format('update public.profiles set is_admin = true where id = %L', t.u(1))), 'usuario no puede hacerse administrador');
select t.ok(t.falla(format('update public.profiles set status = %L where id = %L', 'activo', t.u(1))) = false, 'usuario puede guardar su perfil sin cambiar estado');
select t.ok(t.afecta(format('update public.profiles set phone = %L where id = %L', '999111222', t.u(1))) = 1, 'usuario edita su teléfono');
select t.ok(t.afecta(format('update public.profiles set phone = %L where id = %L', '1', t.u(2))) = 0, 'usuario no edita el perfil de otro');
select t.ok(t.falla(format('insert into public.identity_verifications (user_id, dni, status) values (%L, %L, %L)', t.u(1), '11111111', 'verificado')), 'usuario no puede autoverificarse');
select set_config('app.sistema', 'on', false), set_config('request.jwt.claim.role', 'authenticated', false);
select t.ok(t.falla(format('update public.profiles set is_admin = true where id = %L', t.u(1))), 'un ajuste de configuración falsificado desde el cliente no da privilegios');
select set_config('app.sistema', 'off', false);
select t.como(t.u(3));
select t.ok(t.n('select 1 from public.identity_verifications') = 1, 'vendedor solo ve su propia verificación');
select t.como(t.u(7));
select t.ok(t.n('select 1 from public.identity_verifications') = 2, 'administrador ve todas las verificaciones');
select t.root();
select t.ok(not exists (select 1 from information_schema.columns where table_name = 'perfiles_publicos' and column_name in ('email', 'phone', 'full_name', 'dni')), 'perfil público no expone correo, teléfono ni DNI');

-- 3. Tiendas
select t.como(t.u(3));
select t.ok(t.falla(format('insert into public.stores (owner_id, name, status) values (%L, %L, %L)', t.u(3), 'Tienda trampa', 'aprobada')), 'no se puede crear una tienda ya aprobada');
select t.ok(t.afecta(format('update public.stores set name = %L where id = %L', 'Moda Andina Renovada', t.u(101))) = 1, 'dueño edita su tienda');
select t.ok(t.n(format('select 1 from public.stores where id = %L', t.u(103))) = 0, 'tienda pendiente ajena no es visible');
select t.como(t.u(4));
select t.ok(t.n(format('select 1 from public.stores where id = %L', t.u(103))) = 1, 'dueño ve su tienda pendiente');
select t.ok(t.afecta(format('update public.stores set name = %L where id = %L', 'Hackeada', t.u(101))) = 0, 'otro vendedor no edita tienda ajena');
select t.como(t.u(5));
select t.ok(t.afecta(format('update public.stores set name = %L where id = %L', 'Hackeada', t.u(101))) = 0, 'empleado vendedor no edita datos de la tienda');
select t.como(t.u(2));
select t.ok(t.afecta(format('insert into public.stores (id, owner_id, name, status, offers_pickup) values (%L, %L, %L, %L, true)', t.u(104), t.u(2), 'Tienda nueva de prueba', 'pendiente')) = 1, 'usuario registra una tienda en estado pendiente');
select t.ok(t.falla(format('update public.stores set status = %L where id = %L', 'aprobada', t.u(104))), 'dueño no puede aprobar su propia tienda');
select t.root();
select t.ok((select is_seller from public.profiles where id = t.u(2)), 'al registrar una tienda el usuario pasa a vendedor');
select t.ok(exists (select 1 from public.store_members where store_id = t.u(104) and user_id = t.u(2) and role_code = 'propietario'), 'el dueño queda como miembro propietario');

-- 4. Empleados y permisos por tienda
select t.como(t.u(6));
select t.ok(t.afecta(format('insert into public.products (store_id, category_id, name, price) values (%L, (select id from public.categories where slug = %L), %L, 50)', t.u(101), 'ropa', 'Polo nuevo')) = 1, 'encargado de productos crea productos');
select t.ok(t.n(format('select 1 from public.products where id = %L', t.u(203))) = 1, 'encargado ve productos ocultos de su tienda');
select t.ok(t.n('select 1 from public.requests') = 0, 'encargado de productos no ve solicitudes');
select t.como(t.u(5));
select t.ok(t.falla(format('insert into public.products (store_id, category_id, name, price) values (%L, (select id from public.categories where slug = %L), %L, 50)', t.u(101), 'ropa', 'Polo no autorizado')), 'vendedor sin permiso no crea productos');
select t.ok(t.falla(format('insert into public.store_members (store_id, invited_email, role_code) values (%L, %L, %L)', t.u(101), 'x@prueba.test', 'vendedor')), 'vendedor no puede invitar empleados');
select t.ok(t.n(format('select 1 from public.store_members where store_id = %L', t.u(101))) = 1, 'empleado solo ve su propia fila de miembros');
select t.como(t.u(4));
select t.ok(t.afecta(format('update public.products set price = 1 where id = %L', t.u(201))) = 0, 'vendedor de otra tienda no edita productos ajenos');
select t.ok(t.falla(format('insert into public.products (store_id, category_id, name, price) values (%L, (select id from public.categories where slug = %L), %L, 1)', t.u(101), 'ropa', 'Intruso')), 'vendedor de otra tienda no crea productos en tienda ajena');
select t.ok(t.n(format('select 1 from public.products where id = %L', t.u(203))) = 0, 'otro vendedor no ve productos ocultos ajenos');
select t.como(t.u(8));
select t.ok(t.falla(format('insert into public.products (store_id, category_id, name, price) values (%L, (select id from public.categories where slug = %L), %L, 1)', t.u(101), 'ropa', 'Ex empleado')), 'empleado revocado pierde acceso');
select t.ok(t.n('select 1 from public.requests') = 0, 'empleado revocado no ve solicitudes');
select t.como(t.u(3));
select t.ok(t.afecta(format('insert into public.store_members (store_id, invited_email, role_code, status) values (%L, %L, %L, %L)', t.u(101), 'nuevo.empleado@prueba.test', 'vendedor', 'invitado')) = 1, 'dueño invita empleados');
select t.ok(t.falla(format('insert into public.store_members (store_id, invited_email, role_code) values (%L, %L, %L)', t.u(101), 'otro.dueno@prueba.test', 'propietario')), 'nadie crea otro propietario por invitación');

-- 5. Solicitudes
select t.como(t.u(1));
select t.ok(t.n(format('select 1 from public.requests where id = %L', t.u(301))) = 1, 'comprador ve su solicitud');
select t.ok(t.falla(format('update public.requests set status = %L where id = %L', 'atendida', t.u(301))), 'comprador no marca su solicitud como atendida');
select t.ok(t.afecta(format('update public.requests set expires_at = now() + interval %L where id = %L', '30 days', t.u(301))) = 1, 'comprador intenta alargar el plazo');
select t.ok(t.afecta(format('insert into public.requests (id, buyer_id, title, max_budget) values (%L, %L, %L, 200)', t.u(307), t.u(1), 'Zapatillas talla 40')) = 1, 'comprador publica una solicitud');
select t.ok(t.falla(format('insert into public.requests (buyer_id, title, max_budget) values (%L, %L, -5)', t.u(1), 'Presupuesto inválido')), 'presupuesto negativo rechazado');
select t.ok(t.falla(format('insert into public.requests (buyer_id, title, max_budget) values (%L, %L, 50)', t.u(2), 'A nombre de otro')), 'no se puede publicar a nombre de otro');
select t.ok(t.afecta(format('update public.requests set status = %L where id = %L', 'abierta', t.u(304))) = 1, 'comprador renueva una solicitud vencida');
select t.ok(t.afecta(format('update public.requests set status = %L where id = %L', 'cancelada', t.u(306))) = 1, 'comprador cancela su solicitud');
select t.como(t.u(2));
select t.ok(t.n(format('select 1 from public.requests where id = %L', t.u(301))) = 0, 'otro comprador no ve la solicitud');
select t.ok(t.afecta(format('update public.requests set title = %L where id = %L', 'Hackeada', t.u(301))) = 0, 'otro comprador no edita la solicitud');
select t.como(t.u(3));
select t.ok(t.n(format('select 1 from public.requests where id = %L', t.u(301))) = 1, 'tienda relacionada (dueño) ve la solicitud');
select t.como(t.u(5));
select t.ok(t.n(format('select 1 from public.requests where id = %L', t.u(301))) = 1, 'empleado vendedor de tienda relacionada ve la solicitud');
select t.como(t.u(4));
select t.ok(t.n(format('select 1 from public.requests where id = %L', t.u(301))) = 0, 'tienda NO relacionada no ve la solicitud');
select t.ok(t.n('select 1 from public.request_matches') = 0, 'tienda no relacionada no ve coincidencias');
select t.como(t.u(7));
select t.ok(t.n(format('select 1 from public.requests where id = %L', t.u(301))) = 1, 'administrador ve la solicitud');
select t.root();
select t.ok((select expires_at from public.requests where id = t.u(301)) < now() + interval '25 hours', 'el plazo de 24 h no se puede alargar desde el cliente');
select t.ok((select expires_at > now() + interval '23 hours' and renewed_count = 1 from public.requests where id = t.u(304)), 'la renovación reinicia las 24 h y cuenta la renovación');

-- 6. Ofertas
select t.como(t.u(4));
select t.ok(t.falla(format('insert into public.offers (request_id, store_id, created_by) values (%L, %L, %L)', t.u(301), t.u(102), t.u(4))), 'tienda no relacionada no puede ofertar');
select t.como(t.u(6));
select t.ok(t.falla(format('insert into public.offers (request_id, store_id, created_by) values (%L, %L, %L)', t.u(306), t.u(101), t.u(6))), 'empleado sin permiso de ofertas no puede ofertar');
select t.como(t.u(3));
select t.ok(t.falla(format('insert into public.offers (request_id, store_id, created_by) values (%L, %L, %L)', t.u(305), t.u(101), t.u(3))), 'no se ofrece en una solicitud con plazo vencido');
select t.ok(t.afecta(format('insert into public.offers (id, request_id, store_id, created_by) values (%L, %L, %L, %L)', t.u(410), t.u(301), t.u(101), t.u(3))) = 1, 'tienda relacionada crea oferta');
select t.ok(t.afecta(format('insert into public.offer_history (offer_id, price, description, created_by) values (%L, 149, %L, %L)', t.u(410), 'Talla M, entrega hoy', t.u(3))) = 1, 'tienda registra la propuesta (versión 1)');
select t.ok(t.falla(format('insert into public.offers (request_id, store_id, created_by) values (%L, %L, %L)', t.u(301), t.u(101), t.u(3))), 'una tienda no puede crear dos ofertas para la misma solicitud');
select t.ok(t.afecta(format('update public.offer_history set price = 100 where offer_id = %L', t.u(410))) <= 0, 'la tienda no puede cambiar el precio de una propuesta enviada');
select t.ok(t.afecta(format('delete from public.offer_history where offer_id = %L', t.u(410))) <= 0, 'el historial de propuestas no se puede borrar');
select t.ok(t.afecta(format('insert into public.offer_history (offer_id, price, created_by) values (%L, 140, %L)', t.u(410), t.u(3))) = 1, 'nueva propuesta con otro precio (versión 2)');
select t.root();
select t.ok((select max(version) from public.offer_history where offer_id = t.u(410)) = 2, 'las versiones se numeran solas');
select t.ok((select price from public.offer_history where offer_id = t.u(410) and version = 1) = 149, 'el precio de la versión 1 sigue intacto');
select t.ok((select current_version_id from public.offers where id = t.u(410)) = (select id from public.offer_history where offer_id = t.u(410) and version = 2), 'la oferta apunta a la última versión');
select t.ok((select status from public.requests where id = t.u(301)) = 'con_ofertas', 'la solicitud pasa a "con ofertas"');
select t.como(t.u(1));
select t.ok(t.n(format('select 1 from public.offers where request_id = %L', t.u(301))) = 1, 'comprador ve las ofertas de su solicitud');
select t.ok(t.n(format('select 1 from public.offer_history where offer_id = %L', t.u(410))) = 2, 'comprador ve el historial de propuestas');
select t.ok(t.falla(format('update public.offer_history set price = 1 where offer_id = %L', t.u(410))), 'comprador no puede cambiar precios');
select t.ok(t.afecta(format('update public.offer_history set accepted_by_buyer_at = now() where offer_id = %L and version = 2', t.u(410))) = 1, 'comprador acepta la propuesta vigente');
select t.ok(t.falla(format('update public.offer_history set accepted_by_buyer_at = null where offer_id = %L and version = 2', t.u(410))), 'una aceptación no se puede deshacer');
select t.como(t.u(2));
select t.ok(t.n(format('select 1 from public.offers where id = %L', t.u(410))) = 0, 'otro comprador no ve ofertas ajenas');
select t.como(t.u(4));
select t.ok(t.n(format('select 1 from public.offers where id = %L', t.u(410))) = 0, 'tienda competidora no ve la oferta de otra tienda');
select t.ok(t.n(format('select 1 from public.offer_history where offer_id = %L', t.u(410))) = 0, 'tienda competidora no ve el historial de otra oferta');
select t.como(t.u(5));
select t.ok(t.n(format('select 1 from public.offers where id = %L', t.u(410))) = 1, 'empleado vendedor ve las ofertas de su tienda');
select t.como(t.u(6));
select t.ok(t.n(format('select 1 from public.offers where id = %L', t.u(410))) = 0, 'encargado de productos no ve ofertas');

-- 7. Chat
select t.como(t.u(1));
select t.ok(t.n(format('select 1 from public.messages where conversation_id = %L', t.u(601))) = 1, 'comprador lee su chat');
select t.ok(t.afecta(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)', t.u(601), t.u(1), 'Gracias')) = 1, 'comprador escribe en su chat');
select t.ok(t.falla(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)', t.u(601), t.u(3), 'Suplantación')), 'no se puede escribir como otra persona');
select t.ok(t.afecta(format('update public.messages set body = %L where conversation_id = %L', 'editado', t.u(601))) = 0, 'los mensajes no se editan');
select t.ok(t.afecta(format('delete from public.messages where conversation_id = %L', t.u(601))) = 0, 'los mensajes no se borran');
select t.como(t.u(3));
select t.ok(t.n(format('select 1 from public.messages where conversation_id = %L', t.u(601))) = 2, 'vendedor lee el chat de su pedido');
select t.ok(t.afecta(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)', t.u(601), t.u(3), 'Con gusto')) = 1, 'vendedor responde');
select t.como(t.u(5));
select t.ok(t.n(format('select 1 from public.messages where conversation_id = %L', t.u(601))) = 3, 'empleado con permiso de chat lee');
select t.como(t.u(6));
select t.ok(t.n(format('select 1 from public.messages where conversation_id = %L', t.u(601))) = 0, 'empleado sin permiso de chat no lee');
select t.como(t.u(4));
select t.ok(t.n(format('select 1 from public.messages where conversation_id = %L', t.u(601))) = 0, 'otra tienda no lee el chat');
select t.ok(t.falla(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)', t.u(601), t.u(4), 'Intruso')), 'otra tienda no escribe en el chat');
select t.como(t.u(2));
select t.ok(t.n(format('select 1 from public.messages where conversation_id = %L', t.u(601))) = 0, 'otro comprador no lee el chat');
select t.como(t.u(7));
select t.ok(t.n(format('select 1 from public.messages where conversation_id = %L', t.u(601))) = 0, 'el administrador no lee chats directamente');
select t.ok(t.falla(format('select * from public.admin_leer_chat(%L, %L)', t.u(601), 'corto')), 'administrador debe justificar con un motivo suficiente');
select t.ok(t.n(format('select * from public.admin_leer_chat(%L, %L)', t.u(601), 'Reclamo abierto por pedido no entregado')) = 3, 'administrador lee el chat con motivo justificado');
select t.ok(t.n($q$select 1 from public.audit_logs where action = 'admin_leer_chat'$q$) = 1, 'la lectura justificada queda auditada');
select t.como(t.u(1));
select t.ok(t.falla(format('select * from public.admin_leer_chat(%L, %L)', t.u(601), 'Quiero leer este chat sin ser admin')), 'comprador no puede usar la lectura de administrador');
select t.ok(t.n('select 1 from public.audit_logs') = 0, 'usuarios normales no ven la auditoría');
select t.ok(t.falla($q$select public.registrar_auditoria('x', 'y')$q$), 'usuarios normales no escriben auditoría');
select t.como(t.u(7));
select t.ok(t.falla($q$select public.registrar_auditoria('revision_manual', 'profiles', 'x')$q$) = false, 'administrador registra auditoría');

-- 8. Pedidos, evidencias y código de entrega
select t.como(t.u(1));
select t.ok(t.n(format('select 1 from public.orders where id = %L', t.u(501))) = 1, 'comprador ve su pedido');
select t.ok(t.falla('select * from public.delivery_codes'), 'comprador no lee la tabla de códigos directamente');
select t.ok(t.afecta(format('update public.orders set status = %L where id = %L', 'completada', t.u(502))) = 0, 'comprador no cambia el estado del pedido');
select t.ok(t.n(format('select 1 from public.delivery_events where order_id = %L', t.u(501))) = 1, 'comprador ve la línea de tiempo');
select t.como(t.u(3));
select t.ok(t.falla('select * from public.delivery_codes'), 'vendedor NO puede leer el código de entrega');
select t.ok(t.falla(format('update public.delivery_codes set used_at = now() where order_id = %L', t.u(501))), 'vendedor no puede marcar el código como usado');
select t.ok(t.n(format('select 1 from public.orders where id = %L', t.u(501))) = 1, 'vendedor ve el pedido de su tienda');
select t.ok(t.afecta(format('update public.orders set status = %L where id = %L', 'completada', t.u(502))) = 0, 'vendedor no cambia el estado desde el cliente');
select t.ok(t.afecta(format('insert into public.delivery_evidence (order_id, type, file_path, uploaded_by) values (%L, %L, %L, %L)', t.u(502), 'producto_completo', t.u(502)::text || '/p1.jpg', t.u(3))) = 1, 'vendedor sube evidencia a un pedido en preparación');
select t.ok(t.falla(format('insert into public.delivery_evidence (order_id, type, file_path, uploaded_by) values (%L, %L, %L, %L)', t.u(501), 'producto_completo', t.u(501)::text || '/p1.jpg', t.u(3))), 'no se sube evidencia a un pedido ya entregado');
select t.como(t.u(7));
select t.ok(t.falla('select * from public.delivery_codes'), 'ni el administrador lee el código por tabla');
select t.ok(t.n('select 1 from public.orders') = 2, 'administrador ve todos los pedidos');
select t.como(t.u(4));
select t.ok(t.n('select 1 from public.orders') = 0, 'otra tienda no ve pedidos ajenos');
select t.ok(t.falla(format('insert into public.delivery_evidence (order_id, type, file_path, uploaded_by) values (%L, %L, %L, %L)', t.u(502), 'detalle_estado', 'x.jpg', t.u(4))), 'otra tienda no sube evidencia en pedido ajeno');
select t.como(t.u(2));
select t.ok(t.n('select 1 from public.orders') = 0, 'otro comprador no ve pedidos ajenos');
select t.ok(t.n('select 1 from public.delivery_evidence') = 0, 'otro comprador no ve evidencias ajenas');
select t.como(t.u(6));
select t.ok(t.n('select 1 from public.orders') = 0, 'encargado de productos no ve pedidos');
select t.como(t.u(1));
select t.ok(t.n(format('select 1 from public.delivery_evidence where order_id = %L', t.u(502))) = 1, 'comprador ve las fotos de preparación de su pedido');

-- 9. Calificaciones
select t.como(t.u(1));
select t.ok(t.falla(format('insert into public.ratings (order_id, rater_id, rater_role, rated_id, score) values (%L, %L, %L, %L, 5)', t.u(502), t.u(1), 'comprador', t.u(3))), 'no se califica un pedido no entregado');
select t.ok(t.falla(format('insert into public.ratings (order_id, rater_id, rater_role, rated_id, score) values (%L, %L, %L, %L, 5)', t.u(501), t.u(1), 'comprador', t.u(4))), 'no se califica a quien no participó');
select t.ok(t.falla(format('insert into public.ratings (order_id, rater_id, rater_role, rated_id, score) values (%L, %L, %L, %L, 6)', t.u(501), t.u(1), 'comprador', t.u(3))), 'puntaje fuera de 1 a 5 rechazado');
select t.ok(t.afecta(format('insert into public.ratings (order_id, rater_id, rater_role, rated_id, score, comment) values (%L, %L, %L, %L, 4, %L)', t.u(501), t.u(1), 'comprador', t.u(3), 'Buena atención')) = 1, 'comprador califica al vendedor tras la entrega');
select t.ok(t.falla(format('insert into public.ratings (order_id, rater_id, rater_role, rated_id, score) values (%L, %L, %L, %L, 5)', t.u(501), t.u(1), 'comprador', t.u(3))), 'no se califica dos veces el mismo pedido');
select t.ok(t.afecta(format('update public.ratings set score = 5 where order_id = %L', t.u(501))) = 0, 'una calificación no se edita');
select t.como(t.u(3));
select t.ok(t.afecta(format('insert into public.ratings (order_id, rater_id, rater_role, rated_id, score) values (%L, %L, %L, %L, 5)', t.u(501), t.u(3), 'vendedor', t.u(1))) = 1, 'vendedor califica al comprador');
select t.ok(t.afecta(format('insert into public.rating_reports (rating_id, reporter_id, reason) select id, %L, %L from public.ratings where rated_id = %L', t.u(3), 'Calificación injusta sin motivo', t.u(3))) = 1, 'calificado puede denunciar una calificación abusiva');
select t.como(t.u(2));
select t.ok(t.falla(format('insert into public.ratings (order_id, rater_id, rater_role, rated_id, score) values (%L, %L, %L, %L, 1)', t.u(501), t.u(2), 'comprador', t.u(3))), 'un tercero no puede calificar');
select t.como(t.u(4));
select t.ok(t.n('select 1 from public.ratings') = 2, 'las calificaciones visibles son públicas para usuarios con sesión');
select t.ok(t.falla(format('insert into public.rating_reports (rating_id, reporter_id, reason) select id, %L, %L from public.ratings limit 1', t.u(4), 'Denuncia de un tercero')), 'un tercero no denuncia calificaciones ajenas');
select t.root();
select t.ok((select total_calificaciones = 1 and calificacion_promedio = 4.00 from public.perfiles_publicos where id = t.u(3)), 'reputación pública calculada correctamente');

-- 10. Reclamos, cancelaciones y sanciones
select t.como(t.u(1));
select t.ok(t.falla(format('insert into public.claims (order_id, buyer_id, store_id, type, description) values (%L, %L, %L, %L, %L)', t.u(502), t.u(1), t.u(101), 'pedido_no_entregado', 'Aún en preparación no corresponde reclamar')), 'no se reclama un pedido que no fue enviado');
select t.ok(t.afecta(format('insert into public.claims (id, order_id, buyer_id, store_id, type, description) values (%L, %L, %L, %L, %L, %L)', t.u(701), t.u(501), t.u(1), t.u(101), 'producto_defectuoso', 'El saco llegó con una costura abierta')) = 1, 'comprador presenta un reclamo de su pedido');
select t.ok(t.afecta(format('insert into public.claim_evidence (claim_id, author_id, kind, file_path) values (%L, %L, %L, %L)', t.u(701), t.u(1), 'foto', t.u(701)::text || '/costura.jpg')) = 1, 'comprador adjunta evidencia');
select t.ok(t.afecta(format('update public.claims set status = %L where id = %L', 'resuelto', t.u(701))) = 0, 'comprador no resuelve su propio reclamo');
select t.ok(t.afecta(format('insert into public.cancellations (request_id, cancelled_by, reason_code) values (%L, %L, %L)', t.u(301), t.u(1), 'cambio_opinion')) = 1, 'comprador registra una cancelación con motivo');
select t.ok(t.falla(format('insert into public.cancellations (request_id, cancelled_by, reason_code, review_status) values (%L, %L, %L, %L)', t.u(301), t.u(1), 'otro', 'injustificada')), 'nadie se califica a sí mismo la revisión');
select t.como(t.u(3));
select t.ok(t.n(format('select 1 from public.claims where id = %L', t.u(701))) = 1, 'vendedor ve el reclamo contra su tienda');
select t.ok(t.afecta(format('insert into public.claim_responses (claim_id, author_id, body) values (%L, %L, %L)', t.u(701), t.u(3), 'Podemos cambiar la prenda')) = 1, 'vendedor responde el reclamo');
select t.como(t.u(4));
select t.ok(t.n('select 1 from public.claims') = 0, 'otra tienda no ve reclamos ajenos');
select t.ok(t.falla(format('insert into public.claim_responses (claim_id, author_id, body) values (%L, %L, %L)', t.u(701), t.u(4), 'Intruso')), 'tercero no responde reclamos ajenos');
select t.como(t.u(2));
select t.ok(t.n('select 1 from public.claims') = 0, 'otro comprador no ve reclamos ajenos');
select t.como(t.u(7));
select t.ok(t.n('select 1 from public.claims') = 1, 'administrador ve los reclamos');
select t.ok(t.afecta(format('update public.claims set status = %L, resolution = %L, resolved_by = %L, resolved_at = now() where id = %L', 'resuelto', 'acuerdo_partes', t.u(7), t.u(701))) = 1, 'administrador resuelve el reclamo');
select t.ok(t.afecta(format('insert into public.sanctions (user_id, type, reason, source_type, created_by) values (%L, %L, %L, %L, %L)', t.u(3), 'advertencia', 'Cancelación injustificada comprobada', 'cancelacion', t.u(7))) = 1, 'administrador aplica una advertencia');
select t.como(t.u(3));
select t.ok(t.n('select 1 from public.sanctions') = 1, 'el sancionado ve su sanción');
select t.como(t.u(4));
select t.ok(t.n('select 1 from public.sanctions') = 0, 'otros no ven sanciones ajenas');
select t.ok(t.falla(format('insert into public.sanctions (user_id, type, reason) values (%L, %L, %L)', t.u(3), 'bloqueo', 'Sanción ilegítima')), 'un usuario no puede sancionar a otro');
select t.como(t.u(9));
select t.ok(t.falla(format('insert into public.requests (buyer_id, title, max_budget) values (%L, %L, 100)', t.u(9), 'Cuenta suspendida')), 'una cuenta suspendida no publica solicitudes');

-- 11. Notificaciones
select t.como(t.u(1));
select t.ok(t.n('select 1 from public.notifications') = 1, 'usuario solo ve sus notificaciones');
select t.ok(t.afecta('update public.notifications set read_at = now()') = 1, 'usuario marca su notificación como leída');
select t.ok(t.falla($q$update public.notifications set title = 'Alterado'$q$), 'usuario no altera el contenido de notificaciones');
select t.ok(t.falla(format('insert into public.notifications (user_id, type, title) values (%L, %L, %L)', t.u(2), 'x', 'Falsa')), 'usuario no crea notificaciones');

-- 12. Almacenamiento (Storage)
select t.como(t.u(1));
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'identity-private'$q$) = 1, 'comprador ve solo su archivo de identidad');
select t.ok(t.afecta(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'identity-private', t.u(1)::text || '/selfie.jpg')) = 1, 'comprador sube su selfie a su carpeta');
select t.ok(t.falla(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'identity-private', t.u(3)::text || '/selfie.jpg')), 'no se sube a la carpeta de identidad de otro');
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'chat-private'$q$) = 1, 'comprador ve imágenes de su chat');
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'delivery-evidence'$q$) = 1, 'comprador ve evidencias de su pedido');
select t.ok(t.afecta(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'request-images', t.u(301)::text || '/ref.jpg')) = 1, 'comprador sube referencia a su solicitud');
select t.ok(t.falla(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'claim-evidence', t.u(701)::text || '/foto.jpg')) = false, 'comprador sube evidencia a su reclamo');
select t.como(t.u(2));
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'identity-private'$q$) = 0, 'otro usuario no ve archivos de identidad ajenos');
select t.ok(t.n($q$select 1 from storage.objects where bucket_id in ('chat-private', 'delivery-evidence', 'request-images', 'claim-evidence')$q$) = 0, 'otro usuario no ve chats, evidencias ni referencias ajenas');
select t.ok(t.falla(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'request-images', t.u(301)::text || '/hack.jpg')), 'otro comprador no sube a una solicitud ajena');
select t.ok(t.falla(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'public-catalog', t.u(101)::text || '/hack.png')), 'usuario ajeno no sube al catálogo de una tienda');
select t.como(t.u(3));
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'identity-private'$q$) = 1, 'vendedor ve solo su propio documento de identidad');
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'request-images'$q$) = 1, 'tienda relacionada ve las referencias de la solicitud');
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'chat-private'$q$) = 1, 'vendedor ve imágenes del chat de su pedido');
select t.ok(t.afecta(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'public-catalog', t.u(101)::text || '/saco.png')) = 1, 'tienda sube fotos a su carpeta del catálogo');
select t.ok(t.afecta(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'delivery-evidence', t.u(502)::text || '/paquete.jpg')) = 1, 'tienda sube evidencia de un pedido suyo');
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'claim-evidence'$q$) = 1, 'tienda ve evidencias del reclamo contra ella');
select t.como(t.u(4));
select t.ok(t.n($q$select 1 from storage.objects where bucket_id in ('chat-private', 'delivery-evidence', 'request-images', 'claim-evidence')$q$) = 0, 'tienda ajena no ve chats, evidencias ni referencias');
select t.ok(t.falla(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'public-catalog', t.u(101)::text || '/hack.png')), 'tienda ajena no sube al catálogo de otra tienda');
select t.ok(t.falla(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'delivery-evidence', t.u(502)::text || '/hack.jpg')), 'tienda ajena no sube evidencia de un pedido ajeno');
select t.como(t.u(7));
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'identity-private'$q$) = 3, 'administrador accede a los archivos de identidad');
select t.anon();
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'public-catalog'$q$) >= 1, 'visitante ve imágenes del catálogo público');
select t.ok(t.n($q$select 1 from storage.objects where bucket_id = 'identity-private'$q$) = 0, 'visitante no ve archivos de identidad');

-- 12b. Etapa 5: flujo de verificación de identidad
select t.como(t.u(1));
select t.ok(t.falla(format('insert into public.identity_verifications (user_id, dni) values (%L, %L)', t.u(1), '22222222')), 'no se crean dos verificaciones para el mismo usuario');
select t.ok(t.falla(format('update public.identity_verifications set dni = %L where user_id = %L', '123', t.u(1))), 'DNI con formato inválido rechazado');
select t.ok(t.afecta(format('update public.identity_verifications set dni = %L, submitted_at = now() where user_id = %L', '12345678', t.u(1))) = 1, 'usuario puede corregir su envío mientras está pendiente');
select t.ok(t.falla(format('update public.identity_verifications set status = %L where user_id = %L', 'verificado', t.u(1))), 'usuario no puede marcarse como verificado');
select t.como(t.u(7));
select t.ok(t.n('select iv.id, p.full_name from public.identity_verifications iv join public.profiles p on p.id = iv.user_id') = 2, 'administrador lista verificaciones con nombre del usuario');
select t.ok(t.afecta(format('update public.identity_verifications set status = %L, rejection_reason = %L, reviewed_by = %L, reviewed_at = now() where user_id = %L', 'rechazado', 'Foto del DNI borrosa', t.u(7), t.u(1))) = 1, 'administrador rechaza con motivo');
select t.como(t.u(1));
select t.ok((select rejection_reason from public.identity_verifications where user_id = t.u(1)) = 'Foto del DNI borrosa', 'usuario ve el motivo del rechazo');
select t.ok(t.afecta(format('update public.identity_verifications set status = %L, rejection_reason = null, reviewed_by = null, reviewed_at = null, submitted_at = now() where user_id = %L', 'pendiente', t.u(1))) = 1, 'usuario rechazado puede volver a enviar');
select t.como(t.u(7));
select t.ok(t.afecta(format('update public.identity_verifications set status = %L, reviewed_by = %L, reviewed_at = now() where user_id = %L', 'verificado', t.u(7), t.u(1))) = 1, 'administrador verifica la identidad');
select t.como(t.u(1));
select t.ok(t.afecta(format('update public.identity_verifications set dni = %L where user_id = %L', '99999999', t.u(1))) = 0, 'una identidad verificada no se puede alterar');
select t.root();
insert into storage.objects (bucket_id, name) values ('identity-private', t.u(1)::text || '/dni-final.jpg'), ('identity-private', t.u(3)::text || '/dni-extra.jpg');
select t.como(t.u(1));
select t.ok(t.afecta($q$delete from storage.objects where bucket_id = 'identity-private' and name like '%/dni-final.jpg'$q$) = 0, 'con identidad verificada no se borran los documentos');
select t.como(t.u(3));
select t.ok(t.afecta($q$delete from storage.objects where bucket_id = 'identity-private' and name like '%/dni-extra.jpg'$q$) = 1, 'con verificación pendiente el usuario puede borrar su documento');
select t.anon();
select t.ok(t.falla(format('insert into public.identity_verifications (user_id, dni) values (%L, %L)', t.u(2), '33333333')), 'visitante no registra identidades');

-- 12c. Un DNI por cuenta
select t.como(t.u(2));
select t.ok(t.falla(format('insert into public.identity_verifications (user_id, dni) values (%L, %L)', t.u(2), '12345678')), 'un DNI ya usado en otra cuenta se rechaza');
select t.ok(t.afecta(format('insert into public.identity_verifications (user_id, dni) values (%L, %L)', t.u(2), '44444444')) = 1, 'un DNI nuevo se registra');
select t.como(t.u(4));
select t.ok(t.falla(format('insert into public.identity_verifications (user_id, dni) values (%L, %L)', t.u(4), '44444444')), 'el mismo DNI pendiente en otra cuenta se rechaza');
select t.como(t.u(7));
select t.ok(t.afecta(format('update public.identity_verifications set status = %L, rejection_reason = %L, reviewed_by = %L, reviewed_at = now() where user_id = %L', 'rechazado', 'No coincide con la selfie', t.u(7), t.u(2))) = 1, 'administrador rechaza a un suplantador');
select t.como(t.u(4));
select t.ok(t.afecta(format('insert into public.identity_verifications (user_id, dni) values (%L, %L)', t.u(4), '44444444')) = 1, 'al rechazar, el DNI queda libre para su dueño real');

-- 12d. Etapa 6: invitaciones, empleados y tiendas
select t.root();
create table t.inv as select id from public.store_members where invited_email = 'nuevo.empleado@prueba.test';
grant select on t.inv to public;
select t.como(t.u(10));
select t.ok(t.n('select * from public.mis_invitaciones()') = 1, 'el invitado ve su invitación según el correo de su sesión');
select t.como(t.u(4));
select t.ok(t.n('select * from public.mis_invitaciones()') = 0, 'otro usuario no ve invitaciones ajenas');
select t.ok(t.falla(format('select public.responder_invitacion(%L, true)', (select id from t.inv))), 'otro usuario no puede aceptar una invitación ajena');
select t.ok(t.falla(format('update public.profiles set email = %L where id = %L', 'nuevo.empleado@prueba.test', t.u(4))), 'no se puede cambiar el correo del perfil para robar una invitación');
select t.como(t.u(10));
select t.ok(t.n('select 1 from public.conversations') = 0, 'antes de aceptar, el invitado no ve nada de la tienda');
select t.ok(t.afecta($q$select public.responder_invitacion(id, true) from public.mis_invitaciones()$q$) = 1, 'el invitado acepta la invitación');
select t.ok(t.n('select 1 from public.conversations') = 1, 'tras aceptar, el empleado accede según su rol');
select t.ok(t.n('select * from public.mis_invitaciones()') = 0, 'la invitación aceptada desaparece de pendientes');
select t.root();
select t.ok((select user_id = t.u(10) and status = 'activo' from public.store_members where store_id = t.u(101) and invited_email = 'nuevo.empleado@prueba.test'), 'el empleado queda activo y vinculado a su cuenta');
insert into public.store_members (store_id, user_id, role_code, status) values (t.u(101), t.u(11), 'administrador_tienda', 'activo');

select t.como(t.u(11));
select t.ok(t.falla(format('insert into public.store_members (store_id, invited_email, role_code) values (%L, %L, %L)', t.u(101), 'otro.admin@prueba.test', 'administrador_tienda')), 'un administrador de tienda no crea otros administradores');
select t.ok(t.falla(format('insert into public.store_members (store_id, invited_email, role_code, extra_permissions) values (%L, %L, %L, %L)', t.u(101), 'planes@prueba.test', 'vendedor', '{gestionar_planes}')), 'un administrador de tienda no concede permisos de planes');
select t.ok(t.falla(format('insert into public.store_members (store_id, invited_email, role_code, extra_permissions) values (%L, %L, %L, %L)', t.u(101), 'raro@prueba.test', 'vendedor', '{volar}')), 'un permiso inexistente se rechaza');
select t.ok(t.falla(format('update public.store_members set extra_permissions = %L where store_id = %L and user_id = %L', '{gestionar_planes}', t.u(101), t.u(11))), 'nadie se concede permisos a sí mismo');
select t.ok(t.afecta(format('insert into public.store_members (store_id, invited_email, role_code, extra_permissions) values (%L, %L, %L, %L)', t.u(101), 'Vendedor.Nuevo@Prueba.test', 'vendedor', '{ver_estadisticas}')) = 1, 'un administrador de tienda invita vendedores');
select t.ok(t.afecta(format('update public.stores set description = %L where id = %L', 'Ropa para toda la familia', t.u(101))) = 1, 'administrador de tienda edita los datos de la tienda');
select t.root();
select t.ok(exists (select 1 from public.store_members where invited_email = 'vendedor.nuevo@prueba.test'), 'los correos invitados se guardan en minúsculas');

select t.como(t.u(3));
select t.ok(t.afecta(format('insert into public.store_members (store_id, invited_email, role_code) values (%L, %L, %L)', t.u(101), 'segundo.admin@prueba.test', 'administrador_tienda')) = 1, 'el propietario crea administradores de tienda');
select t.ok(t.afecta(format('update public.store_members set status = %L where store_id = %L and user_id = %L', 'revocado', t.u(101), t.u(5))) = 1, 'el propietario revoca a un empleado');
select t.como(t.u(5));
select t.ok(t.n('select 1 from public.requests') = 0, 'el empleado revocado pierde el acceso al instante');
select t.como(t.u(3));
select t.ok(t.afecta(format('update public.store_members set status = %L where store_id = %L and user_id = %L', 'activo', t.u(101), t.u(5))) = 1, 'el propietario reactiva al empleado');
select t.como(t.u(5));
select t.ok(t.n('select 1 from public.requests') >= 1, 'el empleado reactivado recupera el acceso');

select t.como(t.u(4));
select t.ok(t.n(format('select 1 from public.stores where owner_id = %L', t.u(4))) = 2, 'un propietario administra varias tiendas');
select t.como(t.u(10));
select t.ok(t.n(format('select 1 from public.stores where id = %L', t.u(103))) = 0, 'un empleado no ve las tiendas pendientes de otro propietario');
select t.ok(t.afecta(format('update public.products set price = 1 where store_id = %L', t.u(102))) = 0, 'un empleado de una tienda no toca los productos de otra');

select t.como(t.u(7));
select t.ok(t.afecta(format('update public.stores set status = %L, rejection_reason = %L where id = %L', 'rechazada', 'Falta la dirección', t.u(104))) = 1, 'administrador rechaza una tienda con motivo');
select t.como(t.u(2));
select t.ok((select rejection_reason from public.stores where id = t.u(104)) = 'Falta la dirección', 'el dueño ve por qué fue rechazada');
select t.ok(t.falla(format('update public.stores set status = %L where id = %L', 'aprobada', t.u(104))), 'el dueño no puede aprobarse a sí mismo');
select t.ok(t.afecta(format('update public.stores set status = %L, rejection_reason = null, address = %L where id = %L', 'pendiente', 'Jr. Lima 123 (prueba)', t.u(104))) = 1, 'el dueño corrige y reenvía la tienda rechazada');
select t.como(t.u(7));
select t.ok(t.afecta(format('update public.stores set status = %L where id = %L', 'aprobada', t.u(104))) = 1, 'administrador aprueba la tienda');
select t.anon();
select t.ok(t.n(format('select 1 from public.stores where id = %L', t.u(104))) = 1, 'la tienda aprobada aparece en el público');
select t.como(t.u(7));
select t.ok(t.afecta(format('update public.stores set status = %L, rejection_reason = %L where id = %L', 'suspendida', 'Denuncias comprobadas', t.u(102))) = 1, 'administrador suspende una tienda');
select t.anon();
select t.ok(t.n(format('select 1 from public.products where store_id = %L', t.u(102))) = 0, 'una tienda suspendida desaparece del catálogo público');
select t.como(t.u(4));
select t.ok(t.falla(format('update public.stores set status = %L where id = %L', 'aprobada', t.u(102))), 'el dueño no puede reactivar una tienda suspendida');
select t.como(t.u(7));
select t.ok(t.afecta(format('update public.stores set status = %L, rejection_reason = null where id = %L', 'aprobada', t.u(102))) = 1, 'administrador reactiva la tienda');

-- 13. Estructura y catálogos
select t.root();
select t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'todas las tablas públicas tienen RLS activado');
select t.ok((select count(*) from public.roles) = 4 and (select count(*) from public.permissions) = 9, 'roles y permisos iniciales cargados');
select t.ok((select count(*) from public.role_permissions where role_code = 'vendedor') = 4, 'el rol vendedor tiene 4 permisos');
select t.ok((select count(*) from public.categories) = 7, 'categorías iniciales cargadas');

-- ═════════ RESUMEN ═════════
\o
do $$
declare total int; fallos int;
begin
  select count(*), count(*) filter (where not ok) into total, fallos from t.results;
  raise notice '────────────────────────────────────────';
  raise notice 'Pruebas: % · Aprobadas: % · Fallidas: %', total, total - fallos, fallos;
  if fallos > 0 then raise exception 'HAY PRUEBAS FALLIDAS'; end if;
end $$;
