import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Categoria, ProductoCatalogo } from "./tipos";

export function useCategorias() {
  return useQuery({
    queryKey: ["categorias"],
    queryFn: async (): Promise<Categoria[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("categories").select("id,name,slug,active").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });
}

export type Filtros = {
  texto: string;
  categoria: string;
  precioMin: string;
  precioMax: string;
  orden: "reciente" | "precio_asc" | "precio_desc" | "cerca";
  radioKm: string;
  lat: number | null;
  lng: number | null;
};

export const filtrosVacios: Filtros = { texto: "", categoria: "", precioMin: "", precioMax: "", orden: "reciente", radioKm: "", lat: null, lng: null };

export const TAM_PAGINA = 24;

export async function buscarProductos(f: Partial<Filtros>, desde = 0, limite = TAM_PAGINA): Promise<ProductoCatalogo[]> {
  if (!supabase) return [];
  const num = (v: string | undefined) => (v && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
  const { data, error } = await supabase.rpc("buscar_productos", {
    p_texto: f.texto?.trim() || null,
    p_categoria: f.categoria || null,
    p_precio_min: num(f.precioMin),
    p_precio_max: num(f.precioMax),
    p_lat: f.lat ?? null,
    p_lng: f.lng ?? null,
    p_radio_km: num(f.radioKm),
    p_orden: f.orden ?? "reciente",
    p_limite: limite,
    p_desde: desde,
  });
  if (error) throw error;
  return (data ?? []) as ProductoCatalogo[];
}
