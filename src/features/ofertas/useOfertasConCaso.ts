import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

export default function useOfertasConCaso(ids: string[]) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["casos", "ofertas-con-caso", session?.user.id, ids],
    enabled: Boolean(session && ids.length && supabase),
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("ofertas_tienda_con_reclamo", { p_ids: ids });
      if (error) throw error;
      return new Set<string>(data ?? []);
    },
  });
}
