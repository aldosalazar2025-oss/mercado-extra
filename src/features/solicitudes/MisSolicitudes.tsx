import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton, { clasesBoton } from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { COLUMNAS_SOLICITUD, etiquetaSolicitud, tiempoRestante, type EstadoSolicitud, type Solicitud } from "./tipos";

export default function MisSolicitudes() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const lista = useQuery({
    queryKey: ["mis-solicitudes", uid],
    enabled: Boolean(uid && supabase),
    refetchInterval: 60000,
    queryFn: async (): Promise<Solicitud[]> => {
      if (!supabase || !uid) return [];
      await supabase.rpc("vencer_solicitudes"); // aplica el vencimiento por tiempo
      const { data, error } = await supabase.from("requests").select(COLUMNAS_SOLICITUD).eq("buyer_id", uid).neq("status", "eliminada").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Solicitud[];
    },
  });

  const cambiar = useMutation({
    mutationFn: async (p: { id: string; estado: EstadoSolicitud }) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.from("requests").update({ status: p.estado }).eq("id", p.id).select("id");
      if (r.error || !r.data?.length) throw new Error(r.error?.message.includes("renovaciones") ? "Alcanzaste el máximo de renovaciones. Publica una solicitud nueva." : "No se pudo hacer el cambio.");
      return p.estado;
    },
    onSuccess: (estado) => {
      setMensaje(estado === "abierta" ? "Solicitud renovada: tienes 24 horas más." : estado === "cancelada" ? "Solicitud cancelada." : "Solicitud eliminada.");
      void cliente.invalidateQueries({ queryKey: ["mis-solicitudes"] });
    },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  const pedir = (id: string, estado: EstadoSolicitud, pregunta?: string) => {
    if (!pregunta || confirm(pregunta)) cambiar.mutate({ id, estado });
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/solicitar" className={clasesBoton("primario")}>Publicar una solicitud</Link>
        <p className="mt-2 text-sm text-suave">Cada solicitud dura 24 horas. Si no recibe ofertas, puedes renovarla, modificarla o eliminarla.</p>
      </div>
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudieron cargar tus solicitudes.</p>}
      {lista.data?.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">Aún no publicaste solicitudes. Cuéntanos qué necesitas y las tiendas te harán ofertas.</p>}
      <ul className="space-y-3">
        {lista.data?.map((s) => {
          const e = etiquetaSolicitud[s.status];
          const carac = [s.attributes.talla && `Talla: ${s.attributes.talla}`, s.attributes.color && `Color: ${s.attributes.color}`, s.attributes.modelo && `Modelo: ${s.attributes.modelo}`].filter(Boolean).join(" · ");
          const ocupado = cambiar.isPending;
          return (
            <li key={s.id} className="space-y-3 rounded-xl border border-borde bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="font-display text-lg font-bold">{s.title}</p>
                  <p className="text-sm text-suave">{[s.categories?.name, `Hasta ${soles(s.max_budget)}${s.budget_negotiable ? " (negociable)" : ""}`, carac].filter(Boolean).join(" · ")}</p>
                  {s.description && <p className="text-sm">{s.description}</p>}
                  {s.request_images.length > 0 && <p className="text-sm text-suave">{s.request_images.length} foto(s) de referencia</p>}
                </div>
                <div className="space-y-1 text-right">
                  <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${e.clase}`}>{e.texto}</span>
                  {s.status === "abierta" && <p className="text-sm font-semibold">{tiempoRestante(s.expires_at, ahora)}</p>}
                  {s.status === "con_ofertas" && <p className="text-sm text-suave">Las ofertas se ven en la Etapa 10</p>}
                </div>
              </div>
              {s.status === "vencida" && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Esta solicitud venció sin recibir ofertas. Renuévala para darle 24 horas más.</p>}
              <div className="flex flex-wrap gap-2">
                {s.status === "vencida" && <Boton variante="secundario" disabled={ocupado} onClick={() => pedir(s.id, "abierta")}>Renovar 24 horas</Boton>}
                {(s.status === "abierta" || s.status === "vencida") && <Link to={`/comprador/mis-solicitudes/${s.id}/editar`} className={clasesBoton("contorno")}>Modificar</Link>}
                {(s.status === "abierta" || s.status === "con_ofertas" || s.status === "vencida") && (
                  <Boton variante="contorno" disabled={ocupado} onClick={() => pedir(s.id, "cancelada", "¿Cancelar esta solicitud? Las tiendas dejarán de verla.")}>Cancelar</Boton>
                )}
                {s.status !== "atendida" && s.status !== "con_ofertas" && (
                  <Boton variante="contorno" disabled={ocupado} onClick={() => pedir(s.id, "eliminada", `¿Eliminar «${s.title}»?`)}>Eliminar</Boton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
