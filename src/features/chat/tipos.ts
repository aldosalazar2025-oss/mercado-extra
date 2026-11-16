export type Conversacion = {
  conversation_id: string;
  request_id: string;
  order_id: string | null;
  solicitud: string;
  store_id: string;
  tienda: string;
  buyer_id: string;
  comprador: string;
  estado: "activa" | "cerrada";
  estado_pedido: string | null;
  precio_acordado: number | null;
  mi_rol: "comprador" | "vendedor";
  ultimo_texto: string | null;
  ultimo_tiene_foto: boolean;
  ultimo_envio: string | null;
  no_leidos: number;
};

export type Mensaje = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
};

export const etiquetaPedido: Record<string, string> = {
  oferta_aceptada: "Oferta aceptada",
  compra_coordinada: "Compra coordinada",
  en_preparacion: "En preparación",
  evidencias_registradas: "Evidencias registradas",
  enviado_o_listo: "Enviado o listo para recojo",
  pendiente_confirmacion: "Pendiente de confirmación",
  entregado: "Entregado",
  completada: "Operación completada",
  cancelada: "Cancelado",
};

export function etiquetaDia(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const mismo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismo(d, hoy)) return "Hoy";
  if (mismo(d, ayer)) return "Ayer";
  return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

export function traducirErrorChat(mensaje: string | undefined): string {
  if (!mensaje) return "No se pudo enviar. Inténtalo de nuevo.";
  if (mensaje.includes("muy rápido")) return mensaje;
  if (mensaje.includes("row-level security")) return "No puedes escribir en esta conversación (puede estar cerrada).";
  return "No se pudo enviar. Inténtalo de nuevo.";
}
