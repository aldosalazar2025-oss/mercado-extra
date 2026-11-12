-- MERCADO EXTRA · Etapa 4 · Políticas RLS (Row Level Security)
-- Principio: todo cerrado por defecto; solo se abre lo necesario. Sin política = sin acceso.

-- Activar RLS en TODAS las tablas de la aplicación
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ───────── Privilegios base (defensa en profundidad) ─────────
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
grant select on public.categories, public.stores, public.store_categories, public.store_photos,
  public.products, public.product_images, public.product_tags, public.subscription_plans, public.promotions
  to anon;
-- El código de entrega nunca es accesible directamente
revoke all on public.delivery_codes from authenticated;
-- Notificaciones: el usuario solo puede marcar como leída
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.perfiles_publicos to authenticated;
revoke all on function public.registrar_auditoria(text, text, text, jsonb) from public, anon;
revoke all on function public.admin_leer_chat(uuid, text) from public, anon;

-- ───────── profiles ─────────
create policy profiles_select_propio on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_admin  on public.profiles for select to authenticated using (public.is_admin());
create policy profiles_update_propio on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ───────── identity_verifications (DNI y selfie: solo el dueño y la administración) ─────────
create policy idv_select on public.identity_verifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy idv_insert on public.identity_verifications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pendiente' and reviewed_by is null and reviewed_at is null and rejection_reason is null);
create policy idv_update_propio on public.identity_verifications for update to authenticated
  using (user_id = auth.uid() and status in ('pendiente', 'rechazado'))
  with check (user_id = auth.uid() and status = 'pendiente' and reviewed_by is null and reviewed_at is null and rejection_reason is null);
create policy idv_update_admin on public.identity_verifications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ───────── catálogos de roles y permisos ─────────
create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- ───────── categories ─────────
create policy categories_select on public.categories for select to anon, authenticated using (active or public.is_admin());
create policy categories_admin on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ───────── stores ─────────
create policy stores_select on public.stores for select to anon, authenticated
  using (
    status = 'aprobada'
    or owner_id = auth.uid()
    or id in (select public.tiendas_con_permiso('chat'))
    or id in (select public.tiendas_con_permiso('gestionar_productos'))
    or public.is_admin()
  );
create policy stores_insert on public.stores for insert to authenticated
  with check (owner_id = auth.uid() and status = 'pendiente' and rejection_reason is null and public.cuenta_activa());
create policy stores_update on public.stores for update to authenticated
  using (id in (select public.tiendas_con_permiso('editar_tienda')))
  with check (id in (select public.tiendas_con_permiso('editar_tienda')));
create policy stores_update_admin on public.stores for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy store_categories_select on public.store_categories for select to anon, authenticated
  using (exists (select 1 from public.stores s where s.id = store_id));
create policy store_categories_write on public.store_categories for all to authenticated
  using (store_id in (select public.tiendas_con_permiso('editar_tienda')))
  with check (store_id in (select public.tiendas_con_permiso('editar_tienda')));
create policy store_photos_select on public.store_photos for select to anon, authenticated
  using (exists (select 1 from public.stores s where s.id = store_id));
create policy store_photos_write on public.store_photos for all to authenticated
  using (store_id in (select public.tiendas_con_permiso('editar_tienda')))
  with check (store_id in (select public.tiendas_con_permiso('editar_tienda')));

-- ───────── store_members (empleados) ─────────
create policy members_select on public.store_members for select to authenticated
  using (user_id = auth.uid() or store_id in (select public.tiendas_con_permiso('gestionar_empleados')) or public.is_admin());
create policy members_insert on public.store_members for insert to authenticated
  with check (store_id in (select public.tiendas_con_permiso('gestionar_empleados')) and role_code <> 'propietario');
create policy members_update on public.store_members for update to authenticated
  using (store_id in (select public.tiendas_con_permiso('gestionar_empleados')) and role_code <> 'propietario')
  with check (store_id in (select public.tiendas_con_permiso('gestionar_empleados')) and role_code <> 'propietario');
create policy members_delete on public.store_members for delete to authenticated
  using (store_id in (select public.tiendas_con_permiso('gestionar_empleados')) and role_code <> 'propietario');

-- ───────── products ─────────
create policy products_select on public.products for select to anon, authenticated
  using (
    (status = 'activo' and exists (select 1 from public.stores s where s.id = store_id and s.status = 'aprobada'))
    or store_id in (select public.tiendas_con_permiso('gestionar_productos'))
    or public.is_admin()
  );
create policy products_write on public.products for all to authenticated
  using (store_id in (select public.tiendas_con_permiso('gestionar_productos')))
  with check (store_id in (select public.tiendas_con_permiso('gestionar_productos')));
create policy products_admin on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy product_images_select on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_images_write on public.product_images for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.store_id in (select public.tiendas_con_permiso('gestionar_productos'))))
  with check (exists (select 1 from public.products p where p.id = product_id and p.store_id in (select public.tiendas_con_permiso('gestionar_productos'))));
create policy product_tags_select on public.product_tags for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_tags_write on public.product_tags for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.store_id in (select public.tiendas_con_permiso('gestionar_productos'))))
  with check (exists (select 1 from public.products p where p.id = product_id and p.store_id in (select public.tiendas_con_permiso('gestionar_productos'))));

-- ───────── requests (solicitudes de compradores) ─────────
create policy requests_select on public.requests for select to authenticated
  using (buyer_id = auth.uid() or public.is_admin() or public.solicitud_visible_para_tienda(id));
create policy requests_insert on public.requests for insert to authenticated
  with check (buyer_id = auth.uid() and status = 'abierta' and selected_offer_id is null and renewed_count = 0 and public.cuenta_activa());
create policy requests_update on public.requests for update to authenticated
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());
create policy requests_admin on public.requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy request_images_select on public.request_images for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id));
create policy request_images_insert on public.request_images for insert to authenticated
  with check (exists (select 1 from public.requests r where r.id = request_id and r.buyer_id = auth.uid()));
create policy request_images_delete on public.request_images for delete to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id and r.buyer_id = auth.uid()));

-- Coincidencias: solo las tiendas destinatarias y la administración (las escribe el sistema)
create policy matches_select on public.request_matches for select to authenticated
  using (store_id in (select public.tiendas_con_permiso('ver_solicitudes')) or public.is_admin());

-- ───────── offers y offer_history ─────────
create policy offers_select on public.offers for select to authenticated
  using (
    exists (select 1 from public.requests r where r.id = request_id and r.buyer_id = auth.uid())
    or store_id in (select public.tiendas_con_permiso('enviar_ofertas'))
    or public.is_admin()
  );
create policy offers_insert on public.offers for insert to authenticated
  with check (
    created_by = auth.uid() and status = 'enviada' and current_version_id is null
    and store_id in (select public.tiendas_con_permiso('enviar_ofertas', true))
    and public.solicitud_abierta_para_tienda(request_id, store_id)
  );
create policy offers_update_tienda on public.offers for update to authenticated
  using (store_id in (select public.tiendas_con_permiso('enviar_ofertas')) and status = 'enviada')
  with check (store_id in (select public.tiendas_con_permiso('enviar_ofertas')) and status in ('enviada', 'retirada'));

create policy offer_history_select on public.offer_history for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_id));
create policy offer_history_insert on public.offer_history for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.offers o
      where o.id = offer_id and o.status = 'enviada'
        and o.store_id in (select public.tiendas_con_permiso('enviar_ofertas', true))
    )
  );
create policy offer_history_aceptar on public.offer_history for update to authenticated
  using (exists (select 1 from public.offers o join public.requests r on r.id = o.request_id where o.id = offer_id and r.buyer_id = auth.uid()))
  with check (exists (select 1 from public.offers o join public.requests r on r.id = o.request_id where o.id = offer_id and r.buyer_id = auth.uid()));

-- ───────── orders y entregas (el estado lo cambian funciones del servidor, Etapa 12) ─────────
create policy orders_select on public.orders for select to authenticated using (public.puede_ver_pedido(id));
create policy order_items_select on public.order_items for select to authenticated using (public.puede_ver_pedido(order_id));
create policy delivery_evidence_select on public.delivery_evidence for select to authenticated using (public.puede_ver_pedido(order_id));
create policy delivery_evidence_insert on public.delivery_evidence for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.status in ('compra_coordinada', 'en_preparacion', 'evidencias_registradas')
        and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos', true))
    )
  );
create policy delivery_events_select on public.delivery_events for select to authenticated using (public.puede_ver_pedido(order_id));
-- delivery_codes: sin políticas ni privilegios. delivery_code_attempts: solo administración.
create policy attempts_select_admin on public.delivery_code_attempts for select to authenticated using (public.is_admin());

-- ───────── chat ─────────
create policy conversations_select on public.conversations for select to authenticated
  using (buyer_id = auth.uid() or store_id in (select public.tiendas_con_permiso('chat')));
create policy messages_select on public.messages for select to authenticated
  using (public.can_access_conversation(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and public.cuenta_activa()
    and public.can_access_conversation(conversation_id)
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.status = 'activa')
  );

-- ───────── ratings ─────────
create policy ratings_select on public.ratings for select to authenticated
  using (status = 'visible' or rater_id = auth.uid() or rated_id = auth.uid() or public.is_admin());
create policy ratings_insert on public.ratings for insert to authenticated
  with check (
    rater_id = auth.uid() and status = 'visible' and public.cuenta_activa()
    and public.puede_calificar(order_id, rater_id, rated_id, rater_role)
  );
create policy ratings_admin on public.ratings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy rating_reports_select on public.rating_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy rating_reports_insert on public.rating_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'pendiente'
              and exists (select 1 from public.ratings r where r.id = rating_id and r.rated_id = auth.uid()));
create policy rating_reports_admin on public.rating_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ───────── cancellations y sanctions ─────────
create policy cancellations_select on public.cancellations for select to authenticated
  using (
    cancelled_by = auth.uid() or public.is_admin()
    or (order_id is not null and public.puede_ver_pedido(order_id))
    or exists (select 1 from public.requests r where r.id = request_id and r.buyer_id = auth.uid())
  );
create policy cancellations_insert on public.cancellations for insert to authenticated
  with check (
    cancelled_by = auth.uid() and review_status = 'sin_revision' and reviewed_by is null and public.cuenta_activa()
    and (
      (order_id is not null and public.puede_ver_pedido(order_id))
      or exists (select 1 from public.requests r where r.id = request_id and r.buyer_id = auth.uid())
    )
  );
create policy cancellations_admin on public.cancellations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy sanctions_select on public.sanctions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy sanctions_admin on public.sanctions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ───────── claims ─────────
create policy claims_select on public.claims for select to authenticated using (public.puede_ver_reclamo(id));
create policy claims_insert on public.claims for insert to authenticated
  with check (
    buyer_id = auth.uid() and status = 'abierto' and resolution is null and public.cuenta_activa()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.buyer_id = auth.uid() and o.store_id = claims.store_id
        and o.status in ('enviado_o_listo', 'pendiente_confirmacion', 'entregado', 'completada')
    )
  );
create policy claims_admin on public.claims for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy claim_evidence_select on public.claim_evidence for select to authenticated using (public.puede_ver_reclamo(claim_id));
create policy claim_evidence_insert on public.claim_evidence for insert to authenticated
  with check (author_id = auth.uid() and public.puede_ver_reclamo(claim_id));
create policy claim_responses_select on public.claim_responses for select to authenticated using (public.puede_ver_reclamo(claim_id));
create policy claim_responses_insert on public.claim_responses for insert to authenticated
  with check (author_id = auth.uid() and public.puede_ver_reclamo(claim_id));

-- ───────── notificaciones, planes, promociones y auditoría ─────────
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy plans_select on public.subscription_plans for select to anon, authenticated using (active or public.is_admin());
create policy plans_admin on public.subscription_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (store_id in (select public.tiendas_con_permiso('gestionar_planes')) or public.is_admin());
create policy subscriptions_admin on public.subscriptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy promotions_select on public.promotions for select to anon, authenticated
  using (
    (status = 'activa' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
      and exists (select 1 from public.stores s where s.id = store_id and s.status = 'aprobada'))
    or store_id in (select public.tiendas_con_permiso('gestionar_planes'))
    or public.is_admin()
  );
create policy promotions_insert on public.promotions for insert to authenticated
  with check (status = 'pendiente' and store_id in (select public.tiendas_con_permiso('gestionar_planes', true)));
create policy promotions_admin on public.promotions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());
