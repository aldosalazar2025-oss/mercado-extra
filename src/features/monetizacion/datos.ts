import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

export type MedallaPlan = "bronce" | "plata" | "oro";

export type Plan = { id: string; name: string; price_month: number; max_promociones: number; active: boolean; medalla: MedallaPlan | "ninguna" };
export type SolicitudPlan = {
  id: string; status: string; ends_at: string | null; precio_acordado: number | null; decision: string | null;
  subscription_plans: { name: string } | null; stores: { name: string } | null;
};
export type Promocion = {
  id: string; status: string; ends_at: string | null; dias: number; decision: string | null;
  products: { name: string } | null; stores: { name: string } | null;
};

export function conexion() {
  if (!supabase) throw new Error("Sin conexión con Supabase.");
  return supabase;
}

export function usePlanes(admin = false) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["monetizacion", session?.user.id, "planes", admin],
    queryFn: async () => {
      const q = conexion().from("subscription_plans").select("id,name,price_month,max_promociones,active,medalla");
      if (!admin) q.eq("active", true);
      const { data, error } = await q.order("name").order("id");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

const limite = 20;

export function useSolicitudesComerciales<T extends "plan" | "promocion">(tipo: T, tienda?: string, pagina = 0, admin = false) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["monetizacion", session?.user.id, tipo, admin, tienda, pagina],
    enabled: Boolean(admin || tienda),
    refetchInterval: (consulta) =>
      !admin && consulta.state.data?.filas.some((fila) => fila.status === "pendiente") ? 15_000 : false,
    queryFn: async () => {
      const q = tipo === "plan"
        ? conexion().from("subscriptions").select("id,status,ends_at,precio_acordado,decision,subscription_plans(name),stores(name)")
        : conexion().from("promotions").select("id,status,ends_at,dias,decision,products(name),stores(name)");
      if (tienda) q.eq("store_id", tienda);
      const { data, error } = await q.order(tipo === "plan" ? "starts_at" : "created_at", { ascending: false }).order("id").range(pagina * limite, (pagina + 1) * limite);
      if (error) throw error;
      return { filas: (data ?? []).slice(0, limite) as unknown as (T extends "plan" ? SolicitudPlan : Promocion)[], siguiente: (data?.length ?? 0) > limite };
    },
  });
}

export function estadoComercial(fila: { status: string; ends_at: string | null }) {
  return fila.status === "activa" && fila.ends_at && Date.parse(fila.ends_at) <= Date.now() ? "vencida" : fila.status;
}

export function usePromocionesPublicas(tipo: "tiendas" | "productos", ids: string[]) {
  return useQuery({
    queryKey: ["promociones-publicas", tipo, ids],
    enabled: ids.length > 0 && Boolean(supabase),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await conexion().rpc("catalogo_promocionado", {
        p_tiendas: tipo === "tiendas" ? ids : [],
        p_productos: tipo === "productos" ? ids : [],
      });
      if (error) throw error;
      const clave = tipo === "tiendas" ? "store_id" : "product_id";
      return new Set((data as Record<typeof clave, string>[]).map((fila) => fila[clave]));
    },
  });
}
