export type EstadoSolicitud = "abierta" | "con_ofertas" | "atendida" | "vencida" | "cancelada" | "eliminada";

export type Solicitud = {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  attributes: { talla?: string; color?: string; modelo?: string };
  max_budget: number;
  budget_negotiable: boolean;
  status: EstadoSolicitud;
  expires_at: string;
  renewed_count: number;
  created_at: string;
  categories: { name: string } | null;
  request_images: { id: string; path: string }[];
};

export const COLUMNAS_SOLICITUD =
  "id,title,description,category_id,attributes,max_budget,budget_negotiable,status,expires_at,renewed_count,created_at,categories(name),request_images(id,path)";

export const etiquetaSolicitud: Record<EstadoSolicitud, { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-hoja text-pino" },
  con_ofertas: { texto: "Con ofertas", clase: "bg-maiz-suave text-tinta" },
  atendida: { texto: "Atendida", clase: "bg-borde text-suave" },
  vencida: { texto: "Vencida", clase: "bg-white text-error border border-error/40" },
  cancelada: { texto: "Cancelada", clase: "bg-borde text-suave" },
  eliminada: { texto: "Eliminada", clase: "bg-borde text-suave" },
};

export function tiempoRestante(venceEn: string, ahora: number): string {
  const ms = new Date(venceEn).getTime() - ahora;
  if (ms <= 0) return "Venció";
  const min = Math.floor(ms / 60000);
  const h = Math.floor(min / 60);
  return h > 0 ? `Vence en ${h} h ${min % 60} min` : `Vence en ${min} min`;
}
