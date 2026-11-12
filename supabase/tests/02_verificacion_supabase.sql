-- Verificación de solo lectura para ejecutar en el SQL Editor de Supabase DESPUÉS de aplicar las migraciones.
-- 1) Debe devolver 0 filas (ninguna tabla pública sin RLS):
select c.relname as tabla_sin_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 2) Cantidad de políticas creadas (debe ser mayor que 0):
select count(*) as politicas_public from pg_policies where schemaname = 'public';

-- 3) Buckets creados (public-catalog es el único con public = true):
select id, public, file_size_limit from storage.buckets order by id;

-- 4) Catálogos iniciales (esperado: 4 roles, 9 permisos, 7 categorías):
select (select count(*) from public.roles) as roles,
       (select count(*) from public.permissions) as permisos,
       (select count(*) from public.categories) as categorias;
