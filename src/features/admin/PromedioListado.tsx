import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import EstrellasCalificacion from "@/features/reputacion/EstrellasCalificacion";
import { supabase } from "@/lib/supabase";

type Promedio = { id: string; promedio: number; total: number };

export function usePromediosListado(seccion: "usuarios" | "tiendas", ids: string[]) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["admin", session?.user.id, "promedios", seccion, ids],
    enabled: Boolean(session && supabase && ids.length),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("admin_promedios_listado", { p_seccion: seccion, p_ids: ids });
      if (error) throw error;
      return new Map((data as Promedio[]).map((fila) => [fila.id, fila]));
    },
  });
}

export default function PromedioListado({ id, consulta }: { id: string; consulta: ReturnType<typeof usePromediosListado> }) {
  if (consulta.isPending) return <span className="text-suave">Consultando…</span>;
  if (consulta.isError) return <span className="text-suave">No disponible</span>;
  const fila = consulta.data.get(id);
  if (!fila) return <span className="text-suave">Sin calificaciones</span>;
  const promedio = Number(fila.promedio);
  return <span className="inline-flex flex-wrap items-center gap-1.5">
    <strong>{promedio.toLocaleString("es-PE")}</strong>
    <EstrellasCalificacion puntuacion={promedio} />
    <span className="text-suave">({fila.total})</span>
  </span>;
}
