import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

export type Notificacion = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function useNotificaciones() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["notificaciones", "lista", uid],
    enabled: Boolean(uid && supabase),
    refetchInterval: 60000,
    queryFn: async (): Promise<Notificacion[]> => {
      if (!supabase || !uid) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,payload,read_at,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notificacion[];
    },
  });
}

export function useNoLeidas() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["notificaciones", "no-leidas", uid],
    enabled: Boolean(uid && supabase),
    refetchInterval: 60000,
    queryFn: async (): Promise<number> => {
      if (!supabase || !uid) return 0;
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid).is("read_at", null);
      return count ?? 0;
    },
  });
}

// Escucha avisos nuevos en tiempo real. Debe montarse UNA sola vez (ver NotificacionesEnVivo).
// El nombre del canal es único y cualquier fallo se ignora: la lista igual se actualiza cada minuto.
export function useNotificacionesEnVivo() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const cliente = useQueryClient();
  useEffect(() => {
    if (!supabase || !uid) return;
    const sb = supabase;
    let canal: ReturnType<typeof sb.channel> | null = null;
    try {
      canal = sb
        .channel(`notificaciones-${uid}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, () => {
          void cliente.invalidateQueries({ queryKey: ["notificaciones"] });
        })
        .subscribe();
    } catch (e) {
      console.warn("Tiempo real no disponible; se actualizará cada minuto.", e);
    }
    return () => {
      if (canal) void sb.removeChannel(canal);
    };
  }, [uid, cliente]);
}
