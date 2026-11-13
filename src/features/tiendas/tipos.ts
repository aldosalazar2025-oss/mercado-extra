export type EstadoTienda = "pendiente" | "aprobada" | "rechazada" | "suspendida" | "inactiva";

export type Tienda = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  logo_path: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  business_id: string | null;
  status: EstadoTienda;
  rejection_reason: string | null;
  offers_delivery: boolean;
  offers_pickup: boolean;
};

export const COLUMNAS_TIENDA =
  "id,owner_id,name,description,logo_path,address,latitude,longitude,phone,business_id,status,rejection_reason,offers_delivery,offers_pickup";

export const etiquetaEstado: Record<EstadoTienda, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de aprobación", clase: "bg-maiz-suave text-tinta" },
  aprobada: { texto: "Aprobada", clase: "bg-hoja text-pino" },
  rechazada: { texto: "Rechazada", clase: "bg-white text-error border border-error/40" },
  suspendida: { texto: "Suspendida", clase: "bg-white text-error border border-error/40" },
  inactiva: { texto: "Inactiva", clase: "bg-borde text-suave" },
};

export type Miembro = {
  id: string;
  user_id: string | null;
  role_code: string;
  invited_email: string | null;
  status: "invitado" | "activo" | "revocado";
  extra_permissions: string[];
};
