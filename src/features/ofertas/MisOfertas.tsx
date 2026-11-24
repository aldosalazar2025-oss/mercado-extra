import useOfertasConCaso from "./useOfertasConCaso";
import { AccionHistorial, SeleccionHistorial, useHistorialPersonal } from "@/features/comprador/HistorialPersonal";
import { usePedidos } from "@/features/pedidos/hooks";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton, { clasesBoton } from "@/components/Boton";
import { useMisTiendas, usePermisosPorTienda } from "@/features/tiendas/hooks";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import SelectorTiendaVendedor from "@/features/vendedor/SelectorTiendaVendedor";
import { etiquetaOferta, ordenarVersiones, propuestaPendiente, versionVigente, type EstadoOferta, type Version } from "./tipos";

type Fila = {
  id: string; status: EstadoOferta; store_id: string; request_id: string; current_version_id: string | null; created_at: string;
  stores: { name: string } | null;
  requests: { id: string; title: string; status: string; max_budget: number } | null;
  offer_history: Pick<Version, "id" | "version" | "price" | "created_at" | "accepted_by_buyer_at" | "rejected_by_buyer_at">[];
};

export default function MisOfertas() {
  const tiendas = useMisTiendas();
  const historial = useHistorialPersonal("ofertas_tienda");
  const pedidos = usePedidos();
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [errorChat, setErrorChat] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const permisos = usePermisosPorTienda();
  const [parametros] = useSearchParams();
  const tienda = parametros.get("tienda");
  const disponibles = (tiendas.data ?? []).filter((t) => permisos.data?.get(t.id)?.has("enviar_ofertas"));
  const ids = disponibles.filter((t) => !tienda || t.id === tienda).map((t) => t.id);

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

  const abrirChat = useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.rpc("restaurar_chat_desde_oferta", { p_oferta: id });
      if (error || !data) throw new Error(error?.message ?? "No se encontró el chat de esta oferta.");
      return data as string;
    },
    onMutate: () => setErrorChat(null),
    onSuccess: async (id) => {
      await cliente.invalidateQueries({ queryKey: ["historial-personal"] });
      void navegar(`/vendedor/chat/${id}`);
    },
    onError: (error) => setErrorChat(error.message),
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

  const reclamos = useOfertasConCaso((lista.data ?? []).map((f) => f.id));
  const visibles = (lista.data ?? []).filter((f) => historial.visible(f.id) || reclamos.data?.has(f.id));
  const sePuedeQuitar = (f: Fila) => reclamos.isSuccess && !reclamos.data.has(f.id);


  if (tiendas.isError || permisos.isError) return <p role="alert" className="text-error">No se pudieron cargar las tiendas o sus permisos.</p>;
  if (tiendas.isLoading || permisos.isLoading) return <p className="text-suave">Cargando…</p>;
  if (disponibles.length === 0) return <p className="rounded-xl bg-white p-6 text-suave">Aún no tienes tiendas. Registra una en <Link to="/vendedor/mis-tiendas" className="font-bold text-mercado underline">Mis tiendas</Link>.</p>;

  return (
    <div className="space-y-4">
      <SelectorTiendaVendedor tiendas={disponibles} />
      {ids.length === 0 && <p className="text-suave">Elige una tienda donde tengas permiso para enviar ofertas.</p>}
      <p className="text-suave">Las ofertas que enviaste y cómo van. Si cambias un precio, se envía como una nueva propuesta y la anterior queda en el historial.</p>
      {errorChat && <p role="alert" className="text-sm text-error">{errorChat}</p>}
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {ids.length > 0 && lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudieron cargar tus ofertas.</p>}
      {lista.data && visibles.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">No tienes ofertas visibles. Revisa <Link to="/vendedor/solicitudes-recibidas" className="font-bold text-mercado underline">Solicitudes recibidas</Link>.</p>}
      {reclamos.isError && <p role="alert" className="text-error">No se pudo comprobar si hay reclamos pendientes. Vuelve a intentarlo antes de quitar ofertas.</p>}
      <SeleccionHistorial historial={historial} ids={visibles.filter(sePuedeQuitar).map((f) => f.id)} />
      <ul className="space-y-3">
        {visibles.map((f) => {
          const versiones = ordenarVersiones(f.offer_history);
          const vigente = versionVigente(versiones, f.status, f.current_version_id);
          const e = etiquetaOferta[f.status];
          const pend = propuestaPendiente(versiones, f.status);
          const pedido = pedidos.data?.find((p) => p.mi_rol === "vendedor" && p.request_id === f.request_id && p.store_id === f.store_id);
          const finalizado = pedido?.estado === "completada" || pedido?.estado === "cancelada";
          const abierta = !finalizado && (f.status === "enviada" || f.status === "aceptada");
          return (
            <li key={f.id} className="space-y-4 rounded-xl border border-borde bg-white p-4 sm:p-5">
              <header className="flex items-start justify-between gap-3 border-b border-borde pb-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="break-words font-display text-lg font-bold text-pino">{f.requests?.title ?? "Solicitud"}</h2>
                  {f.stores?.name && <p className="break-words text-sm text-suave">{f.stores.name}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${e.clase}`}>{e.texto}</span>
                  {sePuedeQuitar(f) && <AccionHistorial historial={historial} id={f.id} />}
                </div>
              </header>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-suave">{f.status === "aceptada" ? "Precio acordado" : "Precio ofrecido"}</dt>
                  <dd className="text-xl font-bold text-pino">{vigente ? soles(vigente.price) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-suave">Presupuesto del comprador</dt>
                  <dd className="text-lg font-semibold">{f.requests ? soles(f.requests.max_budget) : "—"}</dd>
                </div>
              </dl>
              {reclamos.data?.has(f.id) && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Hay un reclamo o una devolución pendiente. Podrás quitar la oferta cuando se cierren.</p>}
              {pend && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Esperando la respuesta del comprador a tu propuesta de {soles(pend.price)}.</p>}
              {f.status === "aceptada" && !pend && !finalizado && <p className="rounded-lg bg-hoja p-3 text-sm">El comprador eligió tu oferta. Coordina la entrega con él en el chat.</p>}
              {f.status === "rechazada" && <p className="text-sm text-suave">El comprador eligió otra oferta.</p>}
              {versiones.length > 1 && (
                <details className="rounded-lg border border-borde px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-bold text-mercado">Historial de propuestas ({versiones.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {versiones.map((v) => <li key={v.id}>{new Date(v.created_at).toLocaleString("es-PE")} · {soles(v.price)}{v.rejected_by_buyer_at ? " · rechazada por el comprador" : v.id === vigente?.id && f.status === "aceptada" ? " · precio acordado" : v.accepted_by_buyer_at ? " · aceptada, luego reemplazada" : ""}</li>)}
                  </ul>
                </details>
              )}
              {(f.status === "aceptada" || (abierta && !pend)) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
                  {f.status === "aceptada" && <>
                    <Link to={pedido ? `/vendedor/pedidos/${pedido.order_id}` : "/vendedor/pedidos"} className={clasesBoton("secundario")}>Ver el pedido</Link>
                    <Boton type="button" variante="contorno" disabled={abrirChat.isPending} onClick={() => abrirChat.mutate(f.id)}>
                      {abrirChat.isPending && abrirChat.variables === f.id ? "Abriendo chat…" : "Ir al chat"}
                    </Boton>
                  </>}
                  {abierta && !pend && <>
                    <Link to={`/vendedor/solicitudes-recibidas/${f.request_id}/oferta?tienda=${f.store_id}`} className={clasesBoton("contorno")}>Enviar nueva propuesta</Link>
                    {f.status === "enviada" && (
                      <Boton variante="contorno" disabled={retirar.isPending} onClick={() => { if (confirm("¿Retirar esta oferta? No podrás volver a ofertar en esta solicitud.")) retirar.mutate(f); }}>Retirar oferta</Boton>
                    )}
                  </>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
