-- MERCADO EXTRA · Etapa 4 · Tipos enumerados
create type public.cuenta_estado      as enum ('activo', 'suspendido', 'bloqueado');
create type public.verificacion_estado as enum ('pendiente', 'verificado', 'rechazado');
create type public.tienda_estado      as enum ('pendiente', 'aprobada', 'rechazada', 'suspendida', 'inactiva');
create type public.miembro_estado     as enum ('invitado', 'activo', 'revocado');
create type public.solicitud_estado   as enum ('abierta', 'con_ofertas', 'atendida', 'vencida', 'cancelada', 'eliminada');
create type public.oferta_estado      as enum ('enviada', 'aceptada', 'rechazada', 'reemplazada', 'retirada');
create type public.pedido_estado      as enum ('oferta_aceptada', 'compra_coordinada', 'en_preparacion', 'evidencias_registradas',
                                               'enviado_o_listo', 'pendiente_confirmacion', 'entregado', 'completada', 'cancelada');
create type public.entrega_modo       as enum ('domicilio', 'recojo');
create type public.evidencia_tipo     as enum ('producto_completo', 'detalle_estado', 'producto_en_paquete', 'paquete_cerrado', 'recojo');
create type public.cancelacion_motivo as enum ('producto_agotado', 'producto_diferente', 'precio_fuera_presupuesto',
                                               'cambio_opinion', 'incumplimiento_condiciones', 'otro');
create type public.cancelacion_revision as enum ('sin_revision', 'denunciada', 'justificada', 'injustificada');
create type public.sancion_tipo       as enum ('advertencia', 'suspension_temporal', 'bloqueo');
create type public.reclamo_tipo       as enum ('producto_diferente', 'producto_defectuoso', 'producto_incompleto',
                                               'pedido_no_entregado', 'incumplimiento_condiciones', 'problema_entrega');
create type public.reclamo_estado     as enum ('abierto', 'en_revision', 'resuelto', 'cerrado');
create type public.reclamo_resolucion as enum ('intercambio', 'acuerdo_partes', 'cerrado_sin_incumplimiento', 'sancion');
create type public.calificador_rol    as enum ('comprador', 'vendedor');
create type public.promocion_estado   as enum ('pendiente', 'activa', 'pausada', 'vencida');
create type public.suscripcion_estado as enum ('activa', 'vencida', 'cancelada');
