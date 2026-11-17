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
| 8. Solicitudes de compradores | Cerrada | 294 pruebas de base de datos; aprobada por el usuario | Sí |
| 9. Coincidencias y notificaciones | Cerrada | Aprobada por el usuario (la migración opcional de ajuste no se aplica) | Sí |
| 10. Ofertas y negociación | Cerrada | Probada por el usuario en pantalla (varias correcciones) | Sí |
| 11. Chat | Cerrada | Aprobada por el usuario | Sí |
| 12. Pedidos y entregas | Código listo, falta aplicar migración 0015 | Compilación OK; 522 pruebas SQL; recorrido completo contra PostgREST real (30 controles); regresión de consultas, funciones y chat. Sin probar en navegador | Pendiente |
| 13 a 19 | No iniciadas | - | - |

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

## Etapa 9
Hecho: coincidencia solicitud-tienda por categoría (declarada o presente en sus productos publicados) con puntaje por producto y etiquetas; la tienda del propio comprador no recibe su solicitud; tope de 20 tiendas por solicitud y de 30 avisos por tienda cada 24 h; recálculo al editar la solicitud, renovarla, aprobar una tienda o sumar categorías; avisos solo a propietario y empleados con permiso de ver solicitudes; notificaciones internas con campana, contador, página /notificaciones y tiempo real; "Solicitudes recibidas" para el vendedor con fotos de referencia y opción de descartar.
Solicitudes anteriores a esta migración no se emparejan solas: ejecutar una vez en el SQL Editor `select public.emparejar_solicitud(id) from public.requests where status in ('abierta','con_ofertas');`
Límites conocidos: publicar un producto nuevo no re-evalúa solicitudes ya abiertas (sí lo hace sumar categorías o aprobar la tienda); coincidencia por palabras sin tolerar errores de escritura ni tildes; el botón "Enviar oferta" está desactivado hasta la Etapa 10.
NO probado: pantallas en navegador, tiempo real con Supabase real.
Corrección Etapa 9 (reportada por el usuario): pantalla en blanco al iniciar sesión. Causa: las dos campanas (escritorio y celular) abrían un canal de tiempo real con el mismo nombre y la segunda lanzaba un error que desmontaba toda la aplicación. Solución: el tiempo real se abre una sola vez (NotificacionesEnVivo), con nombre único y sin poder fallar hacia arriba; se añadió LimiteDeErrores (la campana, el tiempo real y cada página se aíslan; si algo falla se muestra un aviso en vez de una pantalla en blanco). Verificado con la librería real de Supabase en Node; sin probar en navegador.
Ajuste Etapa 9 (por prueba del usuario: una tienda de electrónica recibió una solicitud de ropa): si la tienda declaró categorías, solo esas cuentan (los productos solo se usan si no declaró ninguna); el aviso indica "Para <tienda>"; la bandeja siempre muestra la tienda destinataria. Migración 0012; 339 pruebas. Hay consultas de diagnóstico en supabase/DIAGNOSTICO_coincidencias.sql.

## Etapa 10
Hecho: ofertas con precio, descripción, disponibilidad, condiciones de entrega, tiempo estimado, observaciones y hasta 5 fotos; varias tiendas compiten por una solicitud; nuevas propuestas antes de elegir (la anterior queda en el historial); comparación para el comprador ordenada por precio con "Mejor precio", diferencia frente al presupuesto y reputación; elegir_oferta (cierra la solicitud, rechaza las demás, crea pedido, detalle, chat y evento, avisa a la tienda elegida y a las demás); cambios de precio después de elegir que solo valen si el comprador los acepta (responder_propuesta); retirar oferta (si no quedan activas, la solicitud vuelve a abrirse); "Mis ofertas" y "Enviar ofertas" del vendedor; avisos con enlace a la pantalla correcta.
Reglas en base de datos (migración 0013): la versión elegida debe ser la vigente (evita cambios de precio de último momento); una propuesta pendiente a la vez; sin cambios de precio con el pedido enviado; las solicitudes con ofertas siguen eligiéndose aunque pase el plazo, pero las tiendas ya no ofertan después de las 24 h; el comprador ya no acepta propuestas por su cuenta.
Decisiones: retirar una oferta es definitivo para esa solicitud; el pedido nace al elegir (estado "oferta aceptada") y su gestión llega en la Etapa 12; la ajuste opcional de coincidencias (9c) no se aplica por decisión del usuario.
Pendiente: chat (Etapa 11), pedidos, evidencias y código de entrega (Etapa 12), calificaciones (Etapa 13). Hoy la reputación en la comparación muestra "Sin calificaciones todavía".
NO probado: pantallas en navegador, subida real de fotos de ofertas.
Corrección Etapa 10 (reportada por el usuario: "No se pudieron cargar tus solicitudes"): entre requests↔offers y offers↔offer_history existen dos relaciones, y PostgREST rechaza (PGRST201) las uniones sin indicar cuál usar. Se indicaron las relaciones (offers_request_id_fkey, offer_history_offer_id_fkey) en 4 pantallas; se registra en consola la causa real de cualquier consulta fallida; se agregó una vigilancia en las pruebas SQL y pruebas contra PostgREST real (supabase/tests/api): 15 consultas con uniones y 8 funciones verificadas, incluido el error original reproducido antes de la corrección. No requiere migración.
Corrección Etapa 10 (reportada por el usuario con captura): en "Solicitudes recibidas" aparecían las solicitudes de otras tiendas (p. ej. "lolos") y duplicadas. Causa: la cuenta es administradora y la administración ve las coincidencias de todas las tiendas por diseño; la pantalla no filtraba por las tiendas propias. Ahora "Solicitudes recibidas" y "Mis ofertas" solo consideran las tiendas de la persona donde tiene el permiso correspondiente. Verificado contra PostgREST con una administradora dueña de una tienda (antes: 2 tiendas; ahora: 1). No requiere migración. 400 pruebas SQL.
Corrección Etapa 10 (consulta del usuario con captura): tras rechazar el comprador una propuesta de S/ 190, "Mis ofertas" seguía mostrando S/ 190. Debe mostrarse el último precio aceptado (S/ 185). El precio acordado del pedido nunca cambió (orders.agreed_price); era solo la pantalla, que usaba la última propuesta enviada. Nueva regla única versionVigente(): antes de elegir = última enviada; después de elegir = última aceptada. Aplicada en Mis ofertas, comparación del comprador y formulario de nueva propuesta; el historial indica "precio acordado", "aceptada, luego reemplazada" y "rechazada". Verificada con los datos de la captura. No requiere migración.

## Etapa 11
Hecho: conversaciones privadas comprador-tienda (se crean al elegir una oferta), mensajes de texto (hasta 2000 caracteres) y fotos, historial con "ver anteriores", separadores por día, enviar con Enter, contador de mensajes sin leer por persona, lista de conversaciones con último mensaje, avisos de mensajes nuevos agrupados (un aviso por conversación mientras no se lea), tiempo real con respaldo por consulta periódica, cabecera con estado y precio acordado del pedido, aviso de seguridad sobre pagos, vistas separadas por panel (comprador/vendedor).
Reglas en base de datos (migración 0014): solo participantes leen y escriben (comprador y empleados con permiso de chat); las fotos deben estar en la carpeta de la conversación; máximo 30 mensajes por minuto por persona; mensajes sin edición ni borrado; las marcas de lectura solo se escriben con la función; una conversación cerrada conserva el historial pero no admite mensajes. La administración solo lee chats con admin_leer_chat (motivo obligatorio y auditado); su pantalla llega con reclamos (Etapa 14/15).
Entorno de pruebas: la base ahora se crea en UTF8 como Supabase (con la codificación anterior se rechazaban tildes y emojis que llegan por JSON; era un artefacto del entorno).
Límites conocidos: solo fotos (sin archivos ni video); las conversaciones aún no se cierran solas (llega con pedidos y cancelaciones, Etapas 12 y 14); el tiempo real requiere que Supabase Realtime esté activo (si no, se actualiza cada 15 a 30 s).
NO probado: pantallas en navegador ni conexión de tiempo real contra un Supabase real.

## Etapa 12
Hecho: seguimiento del pedido con los 8 estados (oferta aceptada, compra coordinada, en preparación, evidencias registradas, enviado/listo para recojo, entrega en curso, entregado, operación completada) con avance paso a paso y línea de tiempo; 4 fotos obligatorias para entrega a domicilio (producto completo, detalles y estado, producto dentro del paquete, paquete cerrado; hasta 3 por tipo y 15 por pedido; quedan bloqueadas al registrar las evidencias); recojo con fotos opcionales (también al momento de la entrega); código de entrega de 6 dígitos que solo ve el comprador; confirmación de la entrega por la tienda con el código; el comprador completa la operación; lista de compras (comprador) y de pedidos y evidencias (vendedor); avisos con enlace al pedido.
Código de entrega: se genera al marcar enviado/listo (aleatorio fuerte), vence a los 7 días, un solo uso, nunca viaja por aviso ni chat; el comprador puede generar uno nuevo (máximo 3 por pedido; el anterior deja de servir). Intentos: 5 fallos = bloqueo 15 min, 10 = 1 h, 15 = bloqueado hasta código nuevo; además 20 fallos por persona en una hora bloquean a esa persona; cada intento queda registrado y la administración puede auditarlos.
Decisiones: la entrega en curso es un paso opcional; la dirección de entrega a domicilio se coordina por el chat (no se guarda); las fotos son evidencia de preparación, no prueba definitiva de recepción; el comprador cierra la operación manualmente (el cierre automático por calificaciones o por tiempo llega con la Etapa 13); la cancelación de pedidos llega con la Etapa 14.
Límites conocidos: aún no hay cancelación, calificaciones ni reclamos; el vencimiento a 7 días del código no tiene recordatorios; el cierre automático de conversaciones al completar el pedido llega con las etapas siguientes.
NO probado: pantallas en navegador ni subida real de fotos a Storage.
