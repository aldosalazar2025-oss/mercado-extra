-- MERCADO EXTRA · Etapa 4 · Almacenamiento (Supabase Storage)
-- Convención de rutas: la primera carpeta identifica al dueño o al registro:
--   public-catalog   {store_id}/archivo
--   identity-private {user_id}/archivo
--   request-images   {request_id}/archivo
--   chat-private     {conversation_id}/archivo
--   delivery-evidence{order_id}/archivo
--   claim-evidence   {claim_id}/archivo

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-catalog',   'public-catalog',   true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('identity-private', 'identity-private', false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('request-images',   'request-images',   false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-private',     'chat-private',     false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('delivery-evidence','delivery-evidence',false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('claim-evidence',   'claim-evidence',   false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Catálogo público: todos ven; solo la tienda con permiso sube o borra
create policy "catalogo_leer" on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-catalog');
create policy "catalogo_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-catalog' and (
    public.try_uuid((storage.foldername(name))[1]) in (select public.tiendas_con_permiso('editar_tienda'))
    or public.try_uuid((storage.foldername(name))[1]) in (select public.tiendas_con_permiso('gestionar_productos'))));
create policy "catalogo_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'public-catalog' and (
    public.try_uuid((storage.foldername(name))[1]) in (select public.tiendas_con_permiso('editar_tienda'))
    or public.try_uuid((storage.foldername(name))[1]) in (select public.tiendas_con_permiso('gestionar_productos'))));

-- Identidad (DNI y selfie): solo el dueño y la administración
create policy "identidad_leer" on storage.objects for select to authenticated
  using (bucket_id = 'identity-private' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "identidad_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'identity-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "identidad_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'identity-private' and (storage.foldername(name))[1] = auth.uid()::text
         and not exists (select 1 from public.identity_verifications v where v.user_id = auth.uid() and v.status = 'verificado'));

-- Imágenes de solicitudes: el comprador sube; ven el comprador y las tiendas destinatarias
create policy "solicitud_img_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'request-images' and exists (
    select 1 from public.requests r where r.id = public.try_uuid((storage.foldername(name))[1]) and r.buyer_id = auth.uid()));
create policy "solicitud_img_leer" on storage.objects for select to authenticated
  using (bucket_id = 'request-images' and (
    exists (select 1 from public.requests r where r.id = public.try_uuid((storage.foldername(name))[1]) and r.buyer_id = auth.uid())
    or public.solicitud_visible_para_tienda(public.try_uuid((storage.foldername(name))[1]))
    or public.is_admin()));

-- Chat: solo participantes (el administrador accede con admin_leer_chat, que audita)
create policy "chat_img_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-private' and public.can_access_conversation(public.try_uuid((storage.foldername(name))[1])));
create policy "chat_img_leer" on storage.objects for select to authenticated
  using (bucket_id = 'chat-private' and public.can_access_conversation(public.try_uuid((storage.foldername(name))[1])));

-- Evidencias de entrega: sube la tienda del pedido; ven comprador, tienda y administración
create policy "evidencia_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-evidence' and exists (
    select 1 from public.orders o
    where o.id = public.try_uuid((storage.foldername(name))[1])
      and o.store_id in (select public.tiendas_con_permiso('gestionar_pedidos', true))));
create policy "evidencia_leer" on storage.objects for select to authenticated
  using (bucket_id = 'delivery-evidence' and public.puede_ver_pedido(public.try_uuid((storage.foldername(name))[1])));

-- Evidencias de reclamos: partes del reclamo y administración
create policy "reclamo_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-evidence' and public.puede_ver_reclamo(public.try_uuid((storage.foldername(name))[1])));
create policy "reclamo_leer" on storage.objects for select to authenticated
  using (bucket_id = 'claim-evidence' and public.puede_ver_reclamo(public.try_uuid((storage.foldername(name))[1])));
