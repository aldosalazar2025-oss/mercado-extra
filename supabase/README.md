# Base de datos de MERCADO EXTRA (Supabase)

Todas las migraciones están en `migrations/` y se aplican **en orden** (el prefijo numérico manda):

| Archivo | Contenido |
|---|---|
| `20261112000100_tipos.sql` | Tipos enumerados (estados) |
| `20261112000200_tablas.sql` | 38 tablas, relaciones, restricciones e índices |
| `20261112000300_funciones.sql` | Funciones de permisos, disparadores de protección, perfil público |
| `20261112000400_rls.sql` | Políticas RLS (83) y privilegios |
| `20261112000500_storage.sql` | 6 buckets y sus políticas |
| `20261112000600_catalogos.sql` | Roles, permisos y categorías iniciales |
| `20261112000700_dni_unico.sql` | Un DNI por cuenta (Etapa 5) |
| `20261112000800_tiendas_empleados.sql` | Invitaciones, reglas de empleados y protecciones de tienda (Etapa 6) |
| `20261112000900_catalogo.sql` | Moderación de productos, reglas de fotos/etiquetas y búsqueda del catálogo (Etapa 7) |
| `20261112001000_solicitudes.sql` | Reglas de solicitudes: modificar, renovar, vencer, fotos y límites (Etapa 8) |
| `20261112001100_coincidencias.sql` | Coincidencias solicitud-tienda, avisos y topes anti-spam (Etapa 9) |
| `20261112001300_ofertas.sql` | Ofertas, elección, historial de propuestas y fotos de ofertas (Etapa 10) |
| `20261112001400_chat.sql` | Chat: lectura, avisos agrupados, límites y tiempo real (Etapa 11) |
| `20261112001500_pedidos.sql` | Pedidos: pasos, evidencias fotográficas y código de entrega (Etapa 12) |
| `20261112001600_reputacion.sql` | Calificaciones mutuas, acceso a comentarios y reputación por tienda (Etapa 13) |

## Aplicarlas en tu proyecto Supabase de DESARROLLO (gratis, sin instalar nada)
1. Entra a tu proyecto **mercado-extra-dev** > **SQL Editor** > **New query**.
2. Abre el primer archivo en VS Code, copia TODO su contenido, pégalo y pulsa **Run**. Debe decir "Success".
3. Repite con cada archivo pendiente, **uno por uno y en el orden de la tabla**. Si ya aplicaste hasta la Etapa 12, empieza por `20261112001600_reputacion.sql`. Si uno falla, no sigas: copia el error y envíamelo.
4. Ejecuta `tests/02_verificacion_supabase.sql` y compara:
   - consulta 1: **0 filas**
   - consulta 2: **85** políticas en `public`
   - consulta 3: 7 buckets (solo `public-catalog` con `public = true`)
   - consulta 4: 4 roles, 9 permisos, 7 categorías
5. **No** ejecutes `00_shim_supabase.sql` ni `01_rls_tests.sql` en Supabase: son solo para pruebas locales.
6. Aplica estas migraciones únicamente al proyecto **dev**. El proyecto **prod** se prepara en la Etapa 18.

## Crear el primer administrador (después de iniciar sesión con Google, Etapa 5)
En el SQL Editor del proyecto dev:
```sql
update public.profiles set is_admin = true where email = 'TU-CORREO@gmail.com';
```
Es la única forma de crear administradores: un usuario no puede hacerse administrador desde la web.

## Si la web no ve las tablas nuevas
```sql
notify pgrst, 'reload schema';
```

## Pruebas automáticas de permisos (opcional, requiere PostgreSQL propio)
`tests/run_tests.sh` crea una base temporal, simula lo mínimo de Supabase, aplica las migraciones y ejecuta pruebas de permisos y flujos con usuarios ficticios.
No hace falta que las ejecutes tú: yo las corro en cada etapa.

## Archivos opcionales (no son migraciones obligatorias)
`opcionales/OPCIONAL_coincidencias_ajuste.sql`: hace que la categoría declarada por la tienda mande sobre la de sus productos y que los avisos digan "Para <tienda>". No se aplica por decisión del usuario; se puede aplicar en cualquier momento, en cualquier orden, porque solo reemplaza dos funciones. Sus pruebas están en `opcionales/PRUEBAS_coincidencias_ajuste.sql`.
