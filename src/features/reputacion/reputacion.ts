import { supabase } from "@/lib/supabase";

export type Reputacion = {
  id: string;
  calificacion_promedio: number | null;
  total_calificaciones: number;
  conteo_estrellas: number[];
  ventas_completadas: number;
};

export async function cargarReputacion(ids: string[]): Promise<Reputacion[]> {
  if (!supabase || ids.length === 0) return [];
  const { data, error } = await supabase.rpc("reputacion_tiendas", { p_tiendas: ids });
  if (error) throw error;
  return (data ?? []) as Reputacion[];
}

export function textoReputacion(rep: Reputacion): string {
  const total = Number(rep.total_calificaciones);
  const ventas = Number(rep.ventas_completadas);
  const calificacion = total > 0
    ? `${Number(rep.calificacion_promedio).toLocaleString("es-PE", { maximumFractionDigits: 1 })} de 5 · ${total} ${total === 1 ? "calificación" : "calificaciones"}`
    : "Sin calificaciones todavía";
  return `${calificacion} · ${ventas} ${ventas === 1 ? "venta completada" : "ventas completadas"}`;
}
