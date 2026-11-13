# MERCADO EXTRA

Marketplace multivendedor (React + TypeScript + Vite, Supabase, Netlify). Todo con planes gratuitos.

## Requisitos
- Node.js 20 o superior (https://nodejs.org, version LTS)
- Git (https://git-scm.com)
- Cuentas gratuitas: GitHub, Netlify, Supabase

## 1. Ejecutar en tu PC
```bash
cd mercado-extra
npm install
copy .env.example .env.local     # Windows (en Mac/Linux: cp)
npm run dev
```
Abre http://localhost:5173

## 2. Crear los dos proyectos en Supabase (gratis)
1. Entra a https://supabase.com y crea una cuenta.
2. Crea el proyecto **mercado-extra-dev** (region: South America - Sao Paulo). Guarda la contrasena de la base de datos en un lugar seguro.
3. Crea otro proyecto **mercado-extra-prod** (el plan gratuito permite 2 proyectos).
4. En cada proyecto: **Project Settings > API**. Copia:
   - **Project URL**
   - **anon public key**
   - NO copies ni uses la **service_role key** en la web.
5. Abre `.env.local` y pega los valores del proyecto **dev**:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
6. Reinicia `npm run dev`. Debe aparecer "Supabase conectado".

## 3. Subir a GitHub
```bash
git init
git add .
git commit -m "Etapa 2: entorno inicial"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/mercado-extra.git
git push -u origin main
```
(Crea antes el repositorio vacio **mercado-extra** en GitHub, en modo privado.)

## 4. Publicar en Netlify (gratis)
1. https://app.netlify.com > **Add new site > Import an existing project > GitHub** y elige el repositorio.
2. Netlify lee `netlify.toml` (build: `npm run build`, carpeta: `dist`).
3. Antes de desplegar: **Site configuration > Environment variables** y agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
   - Para **Production** usa los valores del proyecto **prod**.
   - Para **Deploy previews / Branch deploys** usa los del proyecto **dev**.
4. Despliega. Cada `git push` publica automaticamente.

## 5. Comprobar
La pagina publicada debe mostrar "Supabase conectado". Entra tambien a una ruta inexistente (por ejemplo `/prueba`) y debe verse "Pagina no encontrada" (no un error 404 de Netlify).

## Seguridad
- Solo la anon key va en el navegador. La service_role nunca.
- `.env.local` esta en `.gitignore`; no se sube a GitHub.

## Etapa 5: inicio de sesión con Google
1. Supabase > **Authentication > URL Configuration**: en *Site URL* pon la dirección de tu sitio en Netlify y en *Redirect URLs* agrega `http://localhost:5173/**` y `https://TU-SITIO.netlify.app/**`.
2. Google Cloud: mientras la app esté en modo "Testing", solo pueden entrar las cuentas agregadas en **Pantalla de consentimiento > Usuarios de prueba**.
3. Primer administrador (después de entrar una vez con tu cuenta), en el SQL Editor de Supabase dev:
   `update public.profiles set is_admin = true where email = 'TU-CORREO@gmail.com';`
4. Rutas nuevas: `/ingresar`, `/registro`, `/cuenta`, `/privacidad`, `/admin/verificacion-de-identidad` (solo administradores).

## Etapa 6: tiendas y empleados
1. Aplica en Supabase dev (SQL Editor) el archivo `supabase/migrations/20261112000800_tiendas_empleados.sql`.
2. Rutas nuevas: `/vendedor/mis-tiendas`, `/vendedor/mis-tiendas/nueva`, `/vendedor/mis-tiendas/:id`, y en el panel admin la sección **Tiendas**.
3. Las invitaciones se aceptan en **Mi cuenta** entrando con el mismo correo de Google al que se invitó.

## Etapa 7: catálogo
1. Aplica en Supabase dev (SQL Editor) `supabase/migrations/20261112000900_catalogo.sql`.
2. Rutas nuevas: `/productos`, `/productos/:id`, `/tiendas`, `/tiendas/:id`, `/vendedor/mis-productos`, y en el panel admin las secciones **Categorías** y **Productos**.
3. Para ver productos en el catálogo público la tienda debe estar **aprobada** y el producto **publicado**.

## Etapa 8: solicitudes
1. Aplica en Supabase dev (SQL Editor) `supabase/migrations/20261112001000_solicitudes.sql`.
2. Rutas nuevas: `/solicitar` (pide iniciar sesión), `/comprador/mis-solicitudes` y `/comprador/mis-solicitudes/:id/editar`.
3. Opcional: vencimiento automático con `supabase/OPCIONAL_pg_cron.sql`.
