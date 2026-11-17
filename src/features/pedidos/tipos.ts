export type EstadoPedido =
  | "oferta_aceptada" | "compra_coordinada" | "en_preparacion" | "evidencias_registradas"
  | "enviado_o_listo" | "pendiente_confirmacion" | "entregado" | "completada" | "cancelada";
export type Modo = "domicilio" | "recojo";
export type TipoEvidencia = "producto_completo" | "detalle_estado" | "producto_en_paquete" | "paquete_cerrado" | "recojo";

export type Pedido = {
  order_id: string; request_id: string; solicitud: string; store_id: string; tienda: string; buyer_id: string; comprador: string;
  estado: EstadoPedido; modo: Modo; precio: number; creado: string; actualizado: string; mi_rol: "comprador" | "vendedor";
  conversation_id: string | null; fotos_obligatorias: number; fotos_total: number; codigo_generado: boolean; codigo_usado: boolean;
};

export type Evidencia = { id: string; type: TipoEvidencia; file_path: string; uploaded_at: string };
export type Evento = { id: string; event: string; from_status: EstadoPedido | null; to_status: EstadoPedido | null; created_at: string };

export const PASOS: EstadoPedido[] = [
  "oferta_aceptada", "compra_coordinada", "en_preparacion", "evidencias_registradas",
  "enviado_o_listo", "pendiente_confirmacion", "entregado", "completada",
];

export function etiquetaEstado(estado: EstadoPedido, modo: Modo): string {
  switch (estado) {
    case "oferta_aceptada": return "Oferta aceptada";
    case "compra_coordinada": return "Compra coordinada";
    case "en_preparacion": return "En preparación";
    case "evidencias_registradas": return "Evidencias registradas";
    case "enviado_o_listo": return modo === "recojo" ? "Listo para recojo" : "Enviado";
    case "pendiente_confirmacion": return "Entrega en curso";
    case "entregado": return "Entregado";
    case "completada": return "Operación completada";
    default: return "Cancelado";
  }
}

export const EVIDENCIAS: { tipo: TipoEvidencia; titulo: string; ayuda: string }[] = [
  { tipo: "producto_completo", titulo: "Producto completo", ayuda: "Todo el producto a la vista, bien iluminado." },
  { tipo: "detalle_estado", titulo: "Detalles y estado", ayuda: "Acercamiento a detalles, etiquetas y posibles marcas." },
  { tipo: "producto_en_paquete", titulo: "Producto dentro del paquete", ayuda: "El producto ya colocado dentro del empaque." },
  { tipo: "paquete_cerrado", titulo: "Paquete cerrado y preparado", ayuda: "El paquete cerrado, listo para entregar." },
];
export const EVIDENCIA_RECOJO = { tipo: "recojo" as const, titulo: "Fotos de la entrega (opcional)", ayuda: "Documenta el estado del producto al momento del recojo." };

export function textoEvento(e: Evento, modo: Modo): string {
  switch (e.event) {
    case "oferta_aceptada": return "El comprador eligió la oferta";
    case "estado": return e.to_status ? etiquetaEstado(e.to_status, modo) : "Cambio de estado";
    case "entrega_confirmada": return "Entrega confirmada con el código";
    case "precio_actualizado": return "El comprador aceptó un nuevo precio";
    case "codigo_regenerado": return "El comprador generó un código nuevo";
    default: return e.event;
  }
}

export type ResultadoEntrega = {
  resultado: "correcto" | "incorrecto" | "bloqueado" | "vencido" | "sin_codigo" | "formato";
  motivo?: "persona" | "intentos" | "regenerar";
  intentos_restantes?: number;
  bloqueado_hasta?: string | null;
};

export function mensajeResultado(r: ResultadoEntrega): { texto: string; ok: boolean } {
  const hasta = r.bloqueado_hasta ? new Date(r.bloqueado_hasta).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : null;
  switch (r.resultado) {
    case "correcto": return { texto: "¡Entrega confirmada! Gracias por entregar el pedido.", ok: true };
    case "incorrecto": return { texto: `Código incorrecto. Te quedan ${r.intentos_restantes ?? 0} intento(s) antes de un bloqueo temporal.`, ok: false };
    case "bloqueado":
      if (r.motivo === "persona") return { texto: "Hiciste demasiados intentos fallidos. Espera una hora antes de volver a intentar.", ok: false };
      if (r.motivo === "regenerar") return { texto: "El código quedó bloqueado. El comprador debe generar uno nuevo desde su pedido.", ok: false };
      return { texto: `Demasiados intentos. El código está bloqueado${hasta ? ` hasta las ${hasta}` : " por un rato"}. El comprador también puede generar uno nuevo.`, ok: false };
    case "vencido": return { texto: "El código venció. El comprador puede generar uno nuevo desde su pedido.", ok: false };
    case "sin_codigo": return { texto: "Este pedido aún no tiene un código de entrega.", ok: false };
    default: return { texto: "Escribe los 6 números del código.", ok: false };
  }
}

export function traducirErrorPedido(mensaje: string | undefined): string {
  if (!mensaje) return "Ocurrió un error. Inténtalo de nuevo.";
  if (mensaje.includes("row-level security")) return "No tienes permiso para hacer esto en este momento.";
  return mensaje;
}

export const rutaPedido = (rol: "comprador" | "vendedor", id: string) => (rol === "comprador" ? `/comprador/mis-compras/${id}` : `/vendedor/pedidos/${id}`);
