import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Evento, Evidencia, Pedido } from "./tipos";

export function usePedidos() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["pedidos", "lista", uid],
    enabled: Boolean(uid && supabase),
    refetchInterval: 30000,
    queryFn: async (): Promise<Pedido[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.rpc("mis_pedidos");
      if (error) throw error;
      return ((data ?? []) as Pedido[]).map((p) => ({ ...p, precio: Number(p.precio), fotos_obligatorias: Number(p.fotos_obligatorias), fotos_total: Number(p.fotos_total) }));
    },
  });
}

export function useEventos(orderId: string) {
  return useQuery({
    queryKey: ["pedidos", "eventos", orderId],
    enabled: Boolean(orderId && supabase),
    refetchInterval: 30000,
    queryFn: async (): Promise<Evento[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("delivery_events").select("id,event,from_status,to_status,created_at").eq("order_id", orderId).order("created_at");
      if (error) throw error;
      return (data ?? []) as Evento[];
    },
  });
}

export function useEvidencias(orderId: string) {
  return useQuery({
    queryKey: ["pedidos", "evidencias", orderId],
    enabled: Boolean(orderId && supabase),
    refetchInterval: 30000,
    queryFn: async () => {
      const urls = new Map<string, string>();
      if (!supabase) return { filas: [] as Evidencia[], urls };
      const { data, error } = await supabase.from("delivery_evidence").select("id,type,file_path,uploaded_at").eq("order_id", orderId).order("uploaded_at");
      if (error) throw error;
      const filas = (data ?? []) as Evidencia[];
      if (filas.length > 0) {
        const f = await supabase.storage.from("delivery-evidence").createSignedUrls(filas.map((x) => x.file_path), 3600);
        (f.data ?? []).forEach((x) => { if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl); });
      }
      return { filas, urls };
    },
  });
}
