-- MERCADO EXTRA · Etapa 4 · Datos iniciales (catálogos, no datos personales)
insert into public.roles (code, name) values
  ('propietario', 'Propietario'),
  ('administrador_tienda', 'Administrador de tienda'),
  ('vendedor', 'Vendedor'),
  ('encargado_productos', 'Encargado de productos');

insert into public.permissions (code, description) values
  ('editar_tienda', 'Editar datos, fotos y categorías de la tienda'),
  ('gestionar_productos', 'Crear, editar y ocultar productos'),
  ('ver_solicitudes', 'Ver solicitudes de compradores dirigidas a la tienda'),
  ('enviar_ofertas', 'Enviar y actualizar ofertas'),
  ('chat', 'Conversar con compradores'),
  ('gestionar_pedidos', 'Administrar pedidos, evidencias y entregas'),
  ('ver_estadisticas', 'Ver estadísticas y reputación de la tienda'),
  ('gestionar_empleados', 'Invitar, cambiar permisos y revocar empleados'),
  ('gestionar_planes', 'Contratar planes y promociones');

insert into public.role_permissions (role_code, permission_code)
select 'propietario', code from public.permissions;
insert into public.role_permissions (role_code, permission_code)
select 'administrador_tienda', code from public.permissions where code <> 'gestionar_planes';
insert into public.role_permissions (role_code, permission_code) values
  ('vendedor', 'ver_solicitudes'), ('vendedor', 'enviar_ofertas'), ('vendedor', 'chat'), ('vendedor', 'gestionar_pedidos'),
  ('encargado_productos', 'gestionar_productos');

insert into public.categories (name, slug) values
  ('Ropa', 'ropa'), ('Calzado', 'calzado'), ('Ferretería', 'ferreteria'), ('Abarrotes', 'abarrotes'),
  ('Electrónica', 'electronica'), ('Hogar', 'hogar'), ('Útiles escolares', 'utiles-escolares');
