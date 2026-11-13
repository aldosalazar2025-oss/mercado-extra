import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import FormularioSolicitud from "./FormularioSolicitud";
import { COLUMNAS_SOLICITUD, type Solicitud } from "./tipos";

export default function SolicitudEditor() {
  const { id } = useParams();
  const { session } = useAuth();
  const ir = useNavigate();
  const consulta = useQuery({
    queryKey: ["solicitud-editar", id],
    enabled: Boolean(id && session && supabase),
    queryFn: async () => {
      if (!supabase || !id || !session) return null;
      const { data, error } = await supabase.from("requests").select(COLUMNAS_SOLICITUD).eq("id", id).eq("buyer_id", session.user.id).maybeSingle();
      if (error) throw error;
      return data as unknown as Solicitud | null;
    },
  });
  const volver = <p><Link to="/comprador/mis-solicitudes" className="font-bold text-mercado underline">← Mis solicitudes</Link></p>;
  if (consulta.isLoading) return <p className="text-suave">Cargando…</p>;
  const s = consulta.data;
  if (!s) return <div className="space-y-3">{volver}<p className="rounded-xl bg-white p-6 text-suave">No encontramos esa solicitud.</p></div>;
  if (s.status !== "abierta" && s.status !== "vencida") {
    return <div className="space-y-3">{volver}<p className="rounded-xl bg-white p-6 text-suave">Esta solicitud ya no se puede modificar porque recibió ofertas o fue cerrada.</p></div>;
  }
  return (
    <div className="space-y-4">
      {volver}
      <h2 className="font-display text-2xl font-extrabold">Modificar solicitud</h2>
      {s.status === "vencida" && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Esta solicitud está vencida. Después de modificarla, renuévala desde «Mis solicitudes».</p>}
      <FormularioSolicitud solicitud={s} onGuardado={() => ir("/comprador/mis-solicitudes", { replace: true })} />
    </div>
  );
}
