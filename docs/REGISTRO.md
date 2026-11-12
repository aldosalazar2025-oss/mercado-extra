# Registro de avance

| Etapa | Estado | Probado | Aprobado |
|---|---|---|---|
| 1. Arquitectura | Entregada | N/A (diseño) | Sí (implícito al avanzar) |
| 2. Entorno | Cerrada | Local y Netlify confirmados por el usuario | Sí |
| 3. Diseño visual | Cerrada | Revisado por el usuario | Sí |
| 4. Base de datos y seguridad | Cerrada | 181 pruebas locales + migraciones aplicadas y verificadas en Supabase dev por el usuario | Sí |
| 5. Registro y autenticación | Código listo | Compilación OK; 194 pruebas de base de datos (incluye flujo de identidad). Sin probar con Google real | Pendiente |
| 6 a 19 | No iniciadas | - | - |

## Etapa 4
Hecho: 6 migraciones (38 tablas, 83 políticas RLS, 6 buckets, catálogos), funciones de permisos por tienda, protección de campos sensibles, historial de ofertas inmutable, lectura de chat por el administrador con motivo y auditoría.
Error encontrado y corregido: un mecanismo interno basado en un ajuste de configuración permitía falsear privilegios; se reemplazó por profundidad de disparadores y se añadió una prueba.
NO probado: ejecución en un Supabase real (solo en PostgreSQL local con simulación). Primera aplicación en dev: revisar errores.
Cambios respecto a la Etapa 1 (a confirmar): coordenadas lat/lng en lugar de PostGIS; código de entrega en tabla bloqueada en lugar de hash; sin tabla conversation_members (acceso derivado del comprador y del permiso de chat); búsqueda por similitud (pg_trgm) se añade en las etapas de catálogo/coincidencias.
Pendiente: funciones de negocio (elegir oferta, pedidos, código de entrega, vencimiento de 24 h) en sus etapas.

## Etapa 5
Hecho: Google OAuth, sesión persistente, registro (nombre, DNI, celular opcional, foto del DNI, selfie, consentimiento), compresión de fotos, subida a bucket privado, estados de verificación, página Mi cuenta, panel admin de identidades con registro de auditoría, rutas protegidas por sesión y por rol, aviso suave de registro pendiente (no bloquea).
NO probado: flujo real con Google y Supabase, subida de fotos desde navegador, aspecto visual.
Límite conocido: el registro de auditoría al abrir documentos lo hace la aplicación; una versión a prueba de manipulación requiere una Edge Function (Etapa 15/18).
Decidido por el usuario: un solo DNI por cuenta (migración 0007, índice único; los registros rechazados liberan el DNI). 199 pruebas de base de datos aprobadas.
Pendiente: política de privacidad definitiva (revisión legal).
