# Registro de avance

| Etapa | Estado | Probado | Aprobado |
|---|---|---|---|
| 1. Arquitectura | Entregada | N/A (diseño) | Sí (implícito al avanzar) |
| 2. Entorno | Cerrada | Local y Netlify confirmados por el usuario | Sí |
| 3. Diseño visual | Cerrada | Revisado por el usuario | Sí |
| 4. Base de datos y seguridad | Cerrada | 181 pruebas locales + migraciones aplicadas y verificadas en Supabase dev por el usuario | Sí |
| 5. Registro y autenticación | Cerrada | Ingreso con Google confirmado por el usuario; 199 pruebas de base de datos | Sí |
| 6. Tiendas y empleados | Cerrada | Probada por el usuario en pantalla (invitaciones, permisos, menú) | Sí |
| 7. Catálogo | Cerrada | 268 pruebas de base de datos; aprobada por el usuario | Sí |
| 8. Solicitudes de compradores | Código listo, falta aplicar migración 0010 | Compilación OK; 294 pruebas de base de datos. Sin probar en pantalla | Pendiente |
| 9 a 19 | No iniciadas | - | - |

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

## Etapa 6
Hecho: registro de tiendas (varias por cuenta, categorías, entrega, ubicación opcional, logotipo), aprobación/rechazo/suspensión/reactivación por la administración con motivo y auditoría, reenvío de tiendas rechazadas, empleados por invitación (correo de Google) con roles y permisos adicionales, aceptación explícita de invitaciones, revocación y reactivación, panel de tiendas del administrador con estado de identidad del dueño.
Seguridad añadida (migración 0008): el correo del perfil no se cambia desde la web; un administrador de tienda no crea otros administradores ni concede permisos de planes/empleados; nadie edita su propio acceso; permisos inexistentes rechazados; correos de invitación en minúsculas; invitaciones reconocidas por el correo del token de sesión.
NO probado: pantallas en navegador, flujo real de invitación con dos cuentas de Google.
Pendiente: productos de la tienda (Etapa 7); notificaciones al dueño cuando se aprueba/rechaza (Etapa 9).
Ajustes posteriores a la Etapa 6 (por pruebas del usuario): ficha de solo lectura para empleados sin permiso de gestionar; los guardados que no cambian nada muestran error en vez de "guardado"; el menú del panel de vendedor muestra solo las secciones que permiten los roles/permisos de la persona en alguna de sus tiendas.

## Etapa 7
Hecho: productos con fotos (hasta 6, comprimidas), etiquetas, categoría, precio, disponibilidad y publicación/ocultamiento/eliminación; catálogo público con buscador, filtros (categoría, precio, distancia) y orden (reciente, precio, cercanía) con paginación; detalle de producto; listado y perfil público de tiendas; inicio con datos reales; categorías y supervisión de productos para el administrador (retiro con motivo, auditado).
Base de datos (migración 0009): búsqueda por texto en español + nombre + etiquetas, comodines tratados como texto, moderación que la tienda no puede revertir, fotos solo de la carpeta de la propia tienda y orden fijado por el sistema, etiquetas en minúsculas, un producto no cambia de tienda.
Límites conocidos: la búsqueda no tolera errores de escritura ni ignora tildes (pg_trgm/unaccent se evaluarán); distancia por línea recta; la página de solicitudes aún usa categorías de ejemplo (Etapa 8).
NO probado: pantallas en navegador, subida real de fotos.
Ajuste Etapa 7 (por consulta del usuario): "Mis productos" solo lista las tiendas donde la persona tiene el permiso de gestionar productos; sin ese permiso la sección no aparece en el menú.

## Etapa 8
Hecho: publicar solicitud (producto, descripción, categoría, talla/color/modelo, presupuesto máximo, negociable, hasta 5 fotos de referencia privadas), "Mis solicitudes" con tiempo restante, modificar, renovar 24 h, cancelar y eliminar; vencimiento a las 24 h con aviso interno al comprador; volver a la página deseada después de iniciar sesión.
Reglas en base de datos (migración 0010): el contenido solo se modifica mientras no hay ofertas; la renovación reinicia las 24 h y se limita a 5; las solicitudes con ofertas NO vencen solas (el comprador aún puede elegir); máximo 10 solicitudes abiertas por comprador; fotos solo de la carpeta de la solicitud; el comprador puede borrar sus fotos.
Vencimiento: la web llama a vencer_solicitudes() al abrir "Mis solicitudes"; opcionalmente se programa cada 5 min con pg_cron (supabase/OPCIONAL_pg_cron.sql, no probado).
Pendiente: coincidencias con tiendas y campana de notificaciones (Etapa 9); si se cambia la categoría de una solicitud, las coincidencias se recalculan en la Etapa 9; ver y elegir ofertas (Etapa 10).
NO probado: pantallas en navegador, subida real de fotos.
