-- Pruebas del ajuste opcional. Solo corren si se aplica OPCIONAL_coincidencias_ajuste.sql (pegar antes de la sección 13 de 01_rls_tests.sql).
-- 12h. Etapa 9 (ajuste): la categoría declarada manda
select t.root();
-- tienda 104 declaró "abarrotes" (12g); le agregamos un producto de ropa
insert into public.products (store_id, category_id, name, price) values (t.u(104), (select id from public.categories where slug = 'ropa'), 'Camisa de prueba', 40);
insert into public.requests (id, buyer_id, title, category_id, max_budget) values (t.u(340), t.u(1), 'Camisa blanca talla L', (select id from public.categories where slug = 'ropa'), 70);
select t.ok((select count(*) from public.coincidencia(t.u(340), t.u(104))) = 0, 'una tienda que declaró otras categorías no recibe ropa solo por tener un producto de ropa');
select t.ok(not exists (select 1 from public.request_matches where request_id = t.u(340) and store_id = t.u(104)), 'y no queda registrada como destinataria');
select t.ok(not exists (select 1 from public.notifications where user_id = t.u(2) and payload ->> 'request_id' = t.u(340)::text), 'ni se le avisa');
-- una tienda sin categorías declaradas sigue pudiendo coincidir por sus productos
insert into public.stores (id, owner_id, name, status, offers_pickup) values (t.u(150), t.u(4), 'Tienda sin categorías (prueba)', 'aprobada', true);
insert into public.products (store_id, category_id, name, price) values (t.u(150), (select id from public.categories where slug = 'ropa'), 'Bufanda de prueba', 25);
select t.ok((select count(*) from public.coincidencia(t.u(340), t.u(150))) = 1, 'sin categorías declaradas, se usan las de sus productos');
-- el aviso indica para qué tienda es
select t.ok(exists (select 1 from public.notifications where user_id = t.u(4) and payload ->> 'request_id' = t.u(331)::text and body like 'Para Ferretería El Tornillo%'), 'el aviso indica la tienda destinataria');

