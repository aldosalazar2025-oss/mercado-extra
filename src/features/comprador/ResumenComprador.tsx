import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clasesBoton } from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

const tarjetas = [
  ["solicitudes", "Solicitudes vigentes", "/comprador/mis-solicitudes"],
  ["ofertas", "Solicitudes con ofertas", "/comprador/ofertas-recibidas"],
  ["compras", "Compras en curso", "/comprador/mis-compras?estado=en-curso"],
  ["reclamos", "Reclamos abiertos", "/comprador/reclamos"],
] as const;

export default function ResumenComprador() {
  const { session, perfil } = useAuth();
  const uid = session?.user.id;
  const consulta = useQuery({
    queryKey: ["resumen-comprador", uid],
    enabled: Boolean(uid && supabase),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!uid || !supabase) throw new Error("Sin conexión con Supabase.");
      const ahora = new Date().toISOString();
      const [solicitudes, ofertas, compras, reclamos] = await Promise.all([
        supabase.from("requests").select("id", { count: "exact", head: true }).eq("buyer_id", uid)
          .in("status", ["abierta", "con_ofertas"]).gt("expires_at", ahora),
        supabase.from("requests").select("id", { count: "exact", head: true }).eq("buyer_id", uid)
          .eq("status", "con_ofertas").gt("expires_at", ahora),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", uid)
          .not("status", "in", "(completada,cancelada)"),
        supabase.from("claims").select("id", { count: "exact", head: true }).eq("buyer_id", uid)
          .in("status", ["abierto", "en_revision"]),
      ]);
      return { solicitudes, ofertas, compras, reclamos };
    },
  });
  const nombre = perfil?.full_name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-borde bg-white p-4">
        <h2 className="font-display text-xl font-extrabold text-pino">{nombre ? `Hola, ${nombre}` : "Tu actividad como comprador"}</h2>
        <Link to="/solicitar" className={clasesBoton("primario")}>Publicar solicitud</Link>
      </section>
      {consulta.isPending && <p className="text-sm text-suave">Cargando tu actividad…</p>}
      {consulta.isError && <p role="alert" className="text-error">No se pudieron cargar tus indicadores.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {tarjetas.map(([clave, titulo, ruta]) => {
          const indicador = consulta.data?.[clave];
          return (
            <li key={clave}>
              <Link to={ruta} className="block h-full rounded-xl border border-borde bg-white p-4 hover:border-mercado">
                <p className="text-3xl font-extrabold text-pino">{indicador?.count?.toLocaleString("es-PE") ?? "—"}</p>
                <p className="mt-1 font-bold">{titulo}</p>
                {indicador?.error && <p className="text-xs text-error">No se pudo consultar el total.</p>}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link to="/comprador/chat" className={clasesBoton("contorno")}>Abrir chat</Link>
        <Link to="/notificaciones" className={clasesBoton("contorno")}>Ver notificaciones</Link>
      </div>
    </div>
  );
}
