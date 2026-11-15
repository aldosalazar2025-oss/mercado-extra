import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { etiquetaSolicitud, type EstadoSolicitud } from "@/features/solicitudes/tipos";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { COLUMNAS_VERSION, etiquetaOferta, ordenarVersiones, propuestaPendiente, traducirError, versionVigente, type EstadoOferta, type Version } from "./tipos";

type Oferta = {
  id: string; status: EstadoOferta; store_id: string; current_version_id: string | null;
  stores: { id: string; name: string; address: string | null; offers_delivery: boolean; offers_pickup: boolean; owner_id: string } | null;
  offer_history: Version[];
};
type Reputacion = { calificacion_promedio: number | null; total_calificaciones: number; ventas_completadas: number };
type Datos = {
  solicitud: { id: string; title: string; max_budget: number; budget_negotiable: boolean; status: EstadoSolicitud } | null;
  ofertas: Oferta[]; reputaciones: Map<string, Reputacion>; urls: Map<string, string>;
};

function TarjetaOferta({ o, datos, puedeElegir, onElegir, ocupado }: {
  o: Oferta; datos: Datos; puedeElegir: boolean; ocupado: boolean; onElegir: (version: Version, modo: "domicilio" | "recojo") => void;
}) {
  const versiones = ordenarVersiones(o.offer_history);
  const vigente = versionVigente(versiones, o.status, o.current_version_id);
  const tienda = o.stores;
  const [modo, setModo] = useState<"domicilio" | "recojo">(tienda?.offers_delivery ? "domicilio" : "recojo");
  const rep = tienda ? datos.reputaciones.get(tienda.owner_id) : undefined;
  if (!vigente || !tienda || !datos.solicitud) return null;
  const dif = datos.solicitud.max_budget - vigente.price;
  const e = etiquetaOferta[o.status];

  return (
    <li className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-display text-lg font-bold"><Link to={`/tiendas/${tienda.id}`} className="hover:underline">{tienda.name}</Link></p>
          <p className="text-sm text-suave">
            {rep && rep.total_calificaciones > 0 ? `${Number(rep.calificacion_promedio).toFixed(1)} de 5 · ${rep.total_calificaciones} calificaciones · ${rep.ventas_completadas} ventas` : "Sin calificaciones todavía"}
          </p>
          <p className="text-sm text-suave">{[tienda.address, [tienda.offers_delivery ? "Entrega a domicilio" : null, tienda.offers_pickup ? "Recojo en tienda" : null].filter(Boolean).join(" y ")].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-3xl font-extrabold text-pino">{soles(vigente.price)}</p>
          <p className="text-sm font-semibold">{dif >= 0 ? `${soles(dif)} bajo tu presupuesto` : `${soles(-dif)} sobre tu presupuesto${datos.solicitud.budget_negotiable ? " (negociable)" : ""}`}</p>
          <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-bold ${e.clase}`}>{e.texto}</span>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {vigente.availability && <div><dt className="font-bold">Disponibilidad</dt><dd>{vigente.availability}</dd></div>}
        {vigente.delivery_terms && <div><dt className="font-bold">Condiciones de entrega</dt><dd>{vigente.delivery_terms}</dd></div>}
        {vigente.eta && <div><dt className="font-bold">Tiempo estimado</dt><dd>{vigente.eta}</dd></div>}
        {vigente.notes && <div><dt className="font-bold">Observaciones</dt><dd>{vigente.notes}</dd></div>}
      </dl>
      {vigente.description && <p className="text-sm">{vigente.description}</p>}
      {vigente.photo_paths.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {vigente.photo_paths.map((p) => <li key={p}>{datos.urls.get(p) ? <img src={datos.urls.get(p)} alt="Foto del producto ofrecido" className="h-24 w-24 rounded-lg border border-borde object-cover" /> : <div className="h-24 w-24 rounded-lg bg-hoja" />}</li>)}
        </ul>
      )}
      {versiones.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold">Historial de propuestas ({versiones.length})</summary>
          <ul className="mt-2 space-y-1">
            {versiones.map((v) => (
              <li key={v.id}>
                {new Date(v.created_at).toLocaleString("es-PE")} · {soles(v.price)}
                {v.rejected_by_buyer_at ? " · rechazada por ti" : v.id === vigente.id ? (o.status === "aceptada" ? " · precio acordado" : " (vigente)") : v.accepted_by_buyer_at ? " · aceptada, luego reemplazada" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {puedeElegir && o.status === "enviada" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-hoja p-3">
          {tienda.offers_delivery && tienda.offers_pickup ? (
            <div>
              <label htmlFor={`modo-${o.id}`} className="block text-sm font-bold">Cómo lo recibes</label>
              <select id={`modo-${o.id}`} className="min-h-11 rounded-lg border border-borde bg-white px-3" value={modo} onChange={(ev) => setModo(ev.target.value as "domicilio" | "recojo")}>
                <option value="domicilio">Entrega a domicilio</option>
                <option value="recojo">Recojo en tienda</option>
              </select>
            </div>
          ) : (
            <p className="text-sm font-semibold">{tienda.offers_delivery ? "Entrega a domicilio" : "Recojo en tienda"}</p>
          )}
          <Boton variante="primario" disabled={ocupado} onClick={() => {
            const m = tienda.offers_delivery && tienda.offers_pickup ? modo : tienda.offers_delivery ? "domicilio" : "recojo";
            if (confirm(`¿Elegir la oferta de ${tienda.name} por ${soles(vigente.price)}? Las demás tiendas serán avisadas y la solicitud se cerrará.`)) onElegir(vigente, m);
          }}>Elegir esta oferta</Boton>
        </div>
      )}
    </li>
  );
}

export default function OfertasSolicitud() {
  const { id } = useParams();
  const { session } = useAuth();
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  const consulta = useQuery({
    queryKey: ["ofertas-solicitud", id],
    enabled: Boolean(id && session && supabase),
    refetchInterval: 30000,
    queryFn: async (): Promise<Datos> => {
      const vacio: Datos = { solicitud: null, ofertas: [], reputaciones: new Map(), urls: new Map() };
      if (!supabase || !id || !session) return vacio;
      const s = await supabase.from("requests").select("id,title,max_budget,budget_negotiable,status").eq("id", id).eq("buyer_id", session.user.id).maybeSingle();
      if (s.error || !s.data) return vacio;
      const o = await supabase
        .from("offers")
        .select(`id,status,store_id,current_version_id,stores(id,name,address,offers_delivery,offers_pickup,owner_id),offer_history!offer_history_offer_id_fkey(${COLUMNAS_VERSION})`)
        .eq("request_id", id).neq("status", "retirada");
      if (o.error) throw o.error;
      const ofertas = (o.data ?? []) as unknown as Oferta[];
      const reputaciones = new Map<string, Reputacion>();
      const duenos = [...new Set(ofertas.map((x) => x.stores?.owner_id).filter((x): x is string => Boolean(x)))];
      if (duenos.length > 0) {
        const r = await supabase.from("perfiles_publicos").select("id,calificacion_promedio,total_calificaciones,ventas_completadas").in("id", duenos);
        (r.data ?? []).forEach((x) => reputaciones.set(x.id as string, { calificacion_promedio: x.calificacion_promedio as number | null, total_calificaciones: Number(x.total_calificaciones), ventas_completadas: Number(x.ventas_completadas) }));
      }
      const urls = new Map<string, string>();
      const rutas = ofertas.flatMap((x) => x.offer_history.flatMap((v) => v.photo_paths));
      if (rutas.length > 0) {
        const f = await supabase.storage.from("offer-images").createSignedUrls([...new Set(rutas)], 3600);
        (f.data ?? []).forEach((x) => { if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl); });
      }
      return { solicitud: s.data as Datos["solicitud"], ofertas, reputaciones, urls };
    },
  });

  const refrescar = () => {
    void cliente.invalidateQueries({ queryKey: ["ofertas-solicitud", id] });
    void cliente.invalidateQueries({ queryKey: ["mis-solicitudes"] });
  };

  const elegir = useMutation({
    mutationFn: async (p: { version: Version; modo: "domicilio" | "recojo" }) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.rpc("elegir_oferta", { p_version: p.version.id, p_modo: p.modo });
      if (r.error) throw new Error(traducirError(r.error.message));
    },
    onSuccess: () => { setMensaje({ texto: "¡Listo! Elegiste la oferta. La solicitud se cerró, avisamos a las demás tiendas y se abrió un chat privado con la tienda elegida (el chat y el seguimiento del pedido llegan en las siguientes etapas).", error: false }); refrescar(); },
    onError: (e) => { setMensaje({ texto: e instanceof Error ? e.message : "Error", error: true }); refrescar(); },
  });
  const responder = useMutation({
    mutationFn: async (p: { version: Version; aceptar: boolean }) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.rpc("responder_propuesta", { p_version: p.version.id, p_aceptar: p.aceptar });
      if (r.error) throw new Error(traducirError(r.error.message));
      return p.aceptar;
    },
    onSuccess: (acepto) => { setMensaje({ texto: acepto ? "Aceptaste el nuevo precio." : "Rechazaste la propuesta; el precio acordado no cambia.", error: false }); refrescar(); },
    onError: (e) => { setMensaje({ texto: e instanceof Error ? e.message : "Error", error: true }); refrescar(); },
  });

  const volver = <p><Link to="/comprador/mis-solicitudes" className="font-bold text-mercado underline">← Mis solicitudes</Link></p>;
  if (consulta.isLoading) return <p className="text-suave">Cargando…</p>;
  const d = consulta.data;
  if (!d?.solicitud) return <div className="space-y-3">{volver}<p className="rounded-xl bg-white p-6 text-suave">No encontramos esa solicitud.</p></div>;

  const s = d.solicitud;
  const e = etiquetaSolicitud[s.status];
  const activas = d.ofertas.filter((o) => o.status === "enviada").sort((a, b) => {
    const pa = a.offer_history.find((v) => v.id === a.current_version_id)?.price ?? Infinity;
    const pb = b.offer_history.find((v) => v.id === b.current_version_id)?.price ?? Infinity;
    return pa - pb;
  });
  const elegida = d.ofertas.find((o) => o.status === "aceptada");
  const otras = d.ofertas.filter((o) => o.status === "rechazada");
  const pendiente = elegida ? propuestaPendiente(elegida.offer_history, elegida.status) : null;
  const vigenteElegida = elegida ? versionVigente(elegida.offer_history, elegida.status, elegida.current_version_id) : null;
  const mejor = activas[0]?.id;

  return (
    <div className="space-y-4">
      {volver}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-extrabold">{s.title}</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${e.clase}`}>{e.texto}</span>
      </div>
      <p className="text-suave">Tu presupuesto máximo: {soles(s.max_budget)}{s.budget_negotiable ? " (negociable)" : ""}</p>
      {mensaje && <p role={mensaje.error ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${mensaje.error ? "border border-error/40 bg-white font-semibold text-error" : "bg-maiz-suave"}`}>{mensaje.texto}</p>}

      {pendiente && elegida && (
        <section className="space-y-2 rounded-xl border-2 border-maiz bg-maiz-suave p-4" aria-live="polite">
          <p className="font-bold">{elegida.stores?.name} propone cambiar el precio</p>
          <p>De {soles(vigenteElegida?.price ?? 0)} a <strong>{soles(pendiente.price)}</strong>{pendiente.notes ? ` · ${pendiente.notes}` : ""}</p>
          <p className="text-sm">El cambio solo vale si lo aceptas. Si lo rechazas, se mantiene el precio acordado.</p>
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" disabled={responder.isPending} onClick={() => responder.mutate({ version: pendiente, aceptar: true })}>Aceptar nuevo precio</Boton>
            <Boton variante="contorno" disabled={responder.isPending} onClick={() => responder.mutate({ version: pendiente, aceptar: false })}>Rechazar</Boton>
          </div>
        </section>
      )}

      {elegida && (
        <section className="space-y-2">
          <h3 className="font-display text-xl font-bold text-pino">Oferta elegida</h3>
          <ul><TarjetaOferta o={elegida} datos={d} puedeElegir={false} ocupado={false} onElegir={() => undefined} /></ul>
        </section>
      )}

      {s.status === "con_ofertas" && (
        <section className="space-y-2">
          <h3 className="font-display text-xl font-bold text-pino">{activas.length} {activas.length === 1 ? "oferta recibida" : "ofertas recibidas"} · ordenadas por precio</h3>
          <div className="space-y-3">
            {activas.map((o) => (
              <div key={o.id} className="space-y-1">
                {o.id === mejor && activas.length > 1 && <p className="w-fit rounded-full bg-maiz px-3 py-0.5 text-sm font-extrabold">Mejor precio</p>}
                <ul><TarjetaOferta o={o} datos={d} puedeElegir ocupado={elegir.isPending} onElegir={(version, modo) => elegir.mutate({ version, modo })} /></ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {!elegida && activas.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">Aún no hay ofertas para esta solicitud. Te avisaremos cuando llegue la primera.</p>}

      {otras.length > 0 && (
        <details>
          <summary className="cursor-pointer font-bold">Otras ofertas recibidas ({otras.length})</summary>
          <ul className="mt-2 space-y-3">{otras.map((o) => <TarjetaOferta key={o.id} o={o} datos={d} puedeElegir={false} ocupado={false} onElegir={() => undefined} />)}</ul>
        </details>
      )}
    </div>
  );
}
