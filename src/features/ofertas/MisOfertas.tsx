import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton, { clasesBoton } from "@/components/Boton";
import { useMisTiendas, usePermisosPorTienda } from "@/features/tiendas/hooks";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { etiquetaOferta, ordenarVersiones, propuestaPendiente, versionVigente, type EstadoOferta, type Version } from "./tipos";

type Fila = {
  id: string; status: EstadoOferta; store_id: string; request_id: string; current_version_id: string | null; created_at: string;
  stores: { name: string } | null;
  requests: { id: string; title: string; status: string; max_budget: number } | null;
  offer_history: Pick<Version, "id" | "version" | "price" | "created_at" | "accepted_by_buyer_at" | "rejected_by_buyer_at">[];
};

export default function MisOfertas() {
  const tiendas = useMisTiendas();
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const permisos = usePermisosPorTienda();
  const ids = (tiendas.data ?? []).filter((t) => permisos.data?.get(t.id)?.has("enviar_ofertas")).map((t) => t.id);

  const lista = useQuery({
    queryKey: ["mis-ofertas", ids.join("|")],
    enabled: ids.length > 0 && Boolean(supabase),
    refetchInterval: 60000,
    queryFn: async (): Promise<Fila[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("offers")
        .select("id,status,store_id,request_id,current_version_id,created_at,stores(name),requests!offers_request_id_fkey(id,title,status,max_budget),offer_history!offer_history_offer_id_fkey(id,version,price,created_at,accepted_by_buyer_at,rejected_by_buyer_at)")
        .in("store_id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const retirar = useMutation({
    mutationFn: async (f: Fila) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.from("offers").update({ status: "retirada" }).eq("id", f.id).select("id");
      if (r.error || !r.data?.length) throw new Error("No se pudo retirar la oferta.");
    },
    onSuccess: () => { setMensaje("Oferta retirada."); void cliente.invalidateQueries({ queryKey: ["mis-ofertas"] }); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  if (tiendas.isLoading || permisos.isLoading) return <p className="text-suave">Cargando…</p>;
  if (ids.length === 0) return <p className="rounded-xl bg-white p-6 text-suave">Aún no tienes tiendas. Registra una en <Link to="/vendedor/mis-tiendas" className="font-bold text-mercado underline">Mis tiendas</Link>.</p>;

  return (
    <div className="space-y-4">
      <p className="text-suave">Las ofertas que enviaste y cómo van. Si cambias un precio, se envía como una nueva propuesta y la anterior queda en el historial.</p>
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudieron cargar tus ofertas.</p>}
      {lista.data?.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">Aún no enviaste ofertas. Revisa <Link to="/vendedor/solicitudes-recibidas" className="font-bold text-mercado underline">Solicitudes recibidas</Link>.</p>}
      <ul className="space-y-3">
        {lista.data?.map((f) => {
          const versiones = ordenarVersiones(f.offer_history);
          const vigente = versionVigente(versiones, f.status, f.current_version_id);
          const e = etiquetaOferta[f.status];
          const pend = propuestaPendiente(versiones, f.status);
          const abierta = f.status === "enviada" || f.status === "aceptada";
          return (
            <li key={f.id} className="space-y-3 rounded-xl border border-borde bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="font-display text-lg font-bold">{f.requests?.title ?? "Solicitud"}</p>
                  <p className="text-sm text-suave">Tienda: {f.stores?.name} · Presupuesto del comprador: {f.requests ? soles(f.requests.max_budget) : "—"}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-2xl font-extrabold text-pino">{vigente ? soles(vigente.price) : "—"}</p>
                  {f.status === "aceptada" && <p className="text-xs font-semibold text-suave">Precio acordado</p>}
                  <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-bold ${e.clase}`}>{e.texto}</span>
                </div>
              </div>
              {pend && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Esperando la respuesta del comprador a tu propuesta de {soles(pend.price)}.</p>}
              {f.status === "aceptada" && !pend && <p className="rounded-lg bg-hoja p-3 text-sm">El comprador eligió tu oferta. Coordina la entrega con él en el chat.</p>}
              {f.status === "rechazada" && <p className="text-sm text-suave">El comprador eligió otra oferta.</p>}
              {versiones.length > 1 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-bold">Historial de propuestas ({versiones.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {versiones.map((v) => <li key={v.id}>{new Date(v.created_at).toLocaleString("es-PE")} · {soles(v.price)}{v.rejected_by_buyer_at ? " · rechazada por el comprador" : v.id === vigente?.id && f.status === "aceptada" ? " · precio acordado" : v.accepted_by_buyer_at ? " · aceptada, luego reemplazada" : ""}</li>)}
                  </ul>
                </details>
              )}
              {f.status === "aceptada" && <><Link to="/vendedor/pedidos" className={clasesBoton("secundario")}>Ver el pedido</Link><Link to="/vendedor/chat" className={clasesBoton("contorno")}>Ir al chat</Link></>}
              {abierta && !pend && (
                <div className="flex flex-wrap gap-2">
                  <Link to={`/vendedor/solicitudes-recibidas/${f.request_id}/oferta?tienda=${f.store_id}`} className={clasesBoton("contorno")}>Enviar nueva propuesta</Link>
                  {f.status === "enviada" && (
                    <Boton variante="contorno" disabled={retirar.isPending} onClick={() => { if (confirm("¿Retirar esta oferta? No podrás volver a ofertar en esta solicitud.")) retirar.mutate(f); }}>Retirar oferta</Boton>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
