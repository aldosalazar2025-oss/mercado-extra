import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Conversacion, Mensaje } from "./tipos";

export function useConversaciones() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["chat", "lista", uid],
    enabled: Boolean(uid && supabase),
    refetchInterval: 30000,
    queryFn: async (): Promise<Conversacion[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.rpc("mis_conversaciones");
      if (error) throw error;
      return ((data ?? []) as Conversacion[]).map((c) => ({ ...c, no_leidos: Number(c.no_leidos) }));
    },
  });
}

export function useMensajes(conversacionId: string, limite: number) {
  return useQuery({
    queryKey: ["chat", "mensajes", conversacionId, limite],
    enabled: Boolean(conversacionId && supabase),
    refetchInterval: 15000,
    queryFn: async (): Promise<Mensaje[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("id,conversation_id,sender_id,body,image_path,created_at")
        .eq("conversation_id", conversacionId)
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) throw error;
      return ((data ?? []) as Mensaje[]).reverse();
    },
  });
}

// Las fotos del chat están en un bucket privado: se muestran con enlaces temporales.
export function useFotoChat(path: string | null, auditoria = false) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["chat", "foto", uid, path, auditoria],
    enabled: Boolean(uid && path && supabase),
    staleTime: (auditoria ? 4 : 50) * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!supabase || !path) return null;
      const { data } = await supabase.storage.from("chat-private").createSignedUrl(path, auditoria ? 300 : 3600);
      return data?.signedUrl ?? null;
    },
  });
}
