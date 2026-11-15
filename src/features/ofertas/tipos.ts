export type EstadoOferta = "enviada" | "aceptada" | "rechazada" | "reemplazada" | "retirada";

export type Version = {
  id: string;
  version: number;
  price: number;
  description: string | null;
  availability: string | null;
  delivery_terms: string | null;
  eta: string | null;
  notes: string | null;
  photo_paths: string[];
  created_at: string;
  accepted_by_buyer_at: string | null;
  rejected_by_buyer_at: string | null;
};

export const COLUMNAS_VERSION =
  "id,version,price,description,availability,delivery_terms,eta,notes,photo_paths,created_at,accepted_by_buyer_at,rejected_by_buyer_at";

export const etiquetaOferta: Record<EstadoOferta, { texto: string; clase: string }> = {
  enviada: { texto: "Enviada", clase: "bg-maiz-suave text-tinta" },
  aceptada: { texto: "Elegida", clase: "bg-hoja text-pino" },
  rechazada: { texto: "No elegida", clase: "bg-borde text-suave" },
  reemplazada: { texto: "Reemplazada", clase: "bg-borde text-suave" },
  retirada: { texto: "Retirada", clase: "bg-borde text-suave" },
};

export const ordenarVersiones = <T extends { version: number }>(v: T[]): T[] => [...v].sort((a, b) => b.version - a.version);

// Propuesta de precio pendiente de respuesta (solo existe después de que la oferta fue elegida).
export function propuestaPendiente<T extends Pick<Version, "version" | "accepted_by_buyer_at" | "rejected_by_buyer_at">>(versiones: T[], estado: EstadoOferta): T | null {
  if (estado !== "aceptada") return null;
  const aceptada = Math.max(0, ...versiones.filter((x) => x.accepted_by_buyer_at).map((x) => x.version));
  return ordenarVersiones(versiones).find((x) => x.version > aceptada && !x.accepted_by_buyer_at && !x.rejected_by_buyer_at) ?? null;
}

// Versión que vale hoy: antes de que la elijan, la última propuesta enviada;
// después de elegida, la última que el comprador ACEPTÓ (una propuesta rechazada o pendiente no cambia el precio).
export function versionVigente<T extends Pick<Version, "id" | "version" | "accepted_by_buyer_at" | "rejected_by_buyer_at">>(
  versiones: T[], estado: EstadoOferta, actualId: string | null,
): T | undefined {
  const ordenadas = ordenarVersiones(versiones);
  if (estado === "aceptada") return ordenadas.find((v) => v.accepted_by_buyer_at && !v.rejected_by_buyer_at) ?? ordenadas[0];
  return ordenadas.find((v) => v.id === actualId) ?? ordenadas[0];
}

export function traducirError(mensaje: string | undefined): string {
  if (!mensaje) return "Ocurrió un error. Inténtalo de nuevo.";
  if (mensaje.includes("row-level security")) return "No tienes permiso para hacer esto, o la solicitud ya no está disponible.";
  if (mensaje.includes("permission denied")) return "No tienes permiso para hacer esto.";
  return mensaje;
}
