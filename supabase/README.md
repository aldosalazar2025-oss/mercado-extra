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

## Aplicarlas en tu proyecto Supabase de DESARROLLO (gratis, sin instalar nada)
1. Entra a tu proyecto **mercado-extra-dev** > **SQL Editor** > **New query**.
2. Abre el primer archivo en VS Code, copia TODO su contenido, pégalo y pulsa **Run**. Debe decir "Success".
3. Repite con cada archivo, **uno por uno y en el orden de la tabla**. Si uno falla, no sigas: copia el error y envíamelo.
4. Ejecuta `tests/02_verificacion_supabase.sql` y compara:
   - consulta 1: **0 filas**
   - consulta 2: **83** políticas
   - consulta 3: 6 buckets (solo `public-catalog` con `public = true`)
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
`tests/run_tests.sh` crea una base temporal, simula lo mínimo de Supabase, aplica las migraciones y ejecuta 233 pruebas con usuarios ficticios.
No hace falta que las ejecutes tú: yo las corro en cada etapa.
