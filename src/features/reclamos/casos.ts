import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

export function useCasosMutation<T>(fn: (arg: T) => Promise<void>) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(["casos", "pedidos", "mis-solicitudes", "ofertas-solicitud", "admin", "monetizacion", "promociones-publicas", "inicio-destacados"].map((key) =>
        cliente.invalidateQueries({ queryKey: [key] }),
      ));
    },
  });
}

export async function accion(nombre: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error("Sin conexión");
  const { error } = await supabase.rpc(nombre, args);
  if (error) throw new Error(error.message);
}

export const tablaCasos = (clase: "reclamo" | "cancelacion" | "sancion") =>
  ({ reclamo: "claims", cancelacion: "cancellations", sancion: "sanctions" } as const)[clase];

export function useUid() {
  return useAuth().session?.user.id ?? "";
}

export const motivos = [
  ["producto_agotado", "Producto agotado"],
  ["producto_diferente", "Producto diferente"],
  ["precio_fuera_presupuesto", "Precio fuera del presupuesto"],
  ["cambio_opinion", "Cambio de opinión"],
  ["incumplimiento_condiciones", "Incumplimiento de condiciones"],
  ["otro", "Otro motivo"],
] as const;
export const tiposReclamo = [
  ["producto_diferente", "Producto diferente"],
  ["producto_defectuoso", "Producto defectuoso"],
  ["producto_incompleto", "Producto incompleto"],
  ["pedido_no_entregado", "Pedido no entregado"],
  ["incumplimiento_condiciones", "Incumplimiento de condiciones"],
  ["problema_entrega", "Problema de entrega"],
] as const;
export const resoluciones = [
  ["intercambio", "Intercambio"],
  ["acuerdo_partes", "Acuerdo entre las partes"],
  ["cerrado_sin_incumplimiento", "Cierre sin incumplimiento"],
  ["sancion", "Incumplimiento que amerita sanción"],
] as const;
export const tiposSancion = [
  ["advertencia", "Advertencia"],
  ["suspension_temporal", "Suspensión temporal"],
  ["bloqueo", "Bloqueo"],
] as const;

export const etiqueta = (valor: string) => valor.replace(/_/g, " ");
