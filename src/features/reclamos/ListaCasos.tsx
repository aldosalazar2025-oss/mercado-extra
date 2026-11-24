import DevolucionReclamo, { devolucionPendiente, type Devolucion } from "./DevolucionReclamo";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Boton, { clasesBoton } from "@/components/Boton";
import FiltroEstado from "@/components/FiltroEstado";
import { AccionHistorial, SeleccionHistorial, useHistorialPersonal } from "@/features/comprador/HistorialPersonal";
import { AccionesTarjeta, SeleccionPapelera, useAccionesPapelera, useSeleccionPapelera } from "@/features/admin/PapeleraAdmin";
import type { ReactNode } from "react";
import { rutaPedido } from "@/features/pedidos/tipos";
import { supabase } from "@/lib/supabase";
import { accion, etiqueta, motivos, resoluciones, tablaCasos, tiposReclamo, tiposSancion, useCasosMutation, useUid } from "./casos";
import { AdjuntarEvidencia, ArchivosCaso } from "./EvidenciasCaso";
import ContextoPedido from "./ContextoPedido";
import { FormularioCaso } from "./FormularioCaso";

type Rol = "comprador" | "vendedor" | "admin";
type Base = { id: string; created_at: string };
type Reclamo = Base & {
  order_id: string; buyer_id: string; store_id: string; type: string; description: string; status: string; resolution: string | null;
  resolution_note: string | null;
  comprador: { full_name: string } | null;
  tienda: { name: string } | null;
  devolucion: Devolucion | null;
  pedido_devolucion: { status: string } | null;
  claim_evidence: { file_path: string }[];
  claim_responses: { id: string; author_id: string; body: string; created_at: string }[];
};
type PersonaCaso = { full_name: string } | null;

type Cancelacion = Base & {
  order_id: string | null; request_id: string | null; cancelled_by: string; reason_code: string; reason_text: string | null;
  review_status: string; report_text: string | null; response_text: string | null; review_note: string | null; evidence_paths: string[];
  cancelador?: PersonaCaso; denunciante?: PersonaCaso; revisor?: PersonaCaso;
  reported_by?: string | null;
  pedido?: { buyer_id: string; tienda: { name: string } | null } | null;
  solicitud?: { buyer_id: string } | null;
};
type Sancion = Base & {
  user_id: string; type: string; reason: string; ends_at: string | null; source_id: string | null;
  source_type: string | null; appeal_text: string | null; appeal_status: string | null;
  sancionado?: PersonaCaso;
  tienda?: { name: string } | null;
  store_id: string | null; starts_at: string; revoked_at: string | null; revocation_reason: string | null;
};

const fecha = (valor: string) => new Date(valor).toLocaleString("es-PE");

const colorEstadoCaso: Record<string, string> = {
  abierto: "text-amber-800",
  denunciada: "text-amber-800",
  en_revision: "text-blue-800",
  resuelto: "text-emerald-800",
  cerrado: "text-emerald-800",
  justificada: "text-emerald-800",
  injustificada: "text-error",
  sin_revision: "text-slate-600",
  pendiente: "text-amber-800",
  aceptada: "text-emerald-800",
  rechazada: "text-error",
};

function EstadoCaso({ estado, creado, resaltar }: { estado: string; creado: string; resaltar: boolean }) {
  return (
    <p className="text-sm text-suave">
      <span className={resaltar ? `font-bold capitalize ${colorEstadoCaso[estado] ?? "text-slate-600"}` : "capitalize"}>
        {etiqueta(estado)}
      </span>{" · "}{fecha(creado)}
    </p>
  );
}

function FormularioSancion({ id, origen, destinatario }: {
  id: string; origen: "reclamo" | "cancelacion" | "usuario" | "tienda"; destinatario: string;
}) {
  return <FormularioCaso titulo="Aplicar sanción" opciones={tiposSancion} pedirDias confirmar destinatario={destinatario}
    etiquetaTexto="Motivo de la sanción"
    ejecutar={(texto, tipo, dias, horas) => accion("aplicar_sancion", {
      p_id: id, p_origen: origen, p_tipo: tipo, p_dias: dias, p_horas: horas, p_motivo: texto,
    })} />;
}

function AplicarSancion({ id, origen, destinatario }: {
  id: string; origen: "reclamo" | "cancelacion"; destinatario: string | null;
}) {
  const consulta = useQuery({
    queryKey: ["casos", "sancion", origen, id],
    queryFn: async () => {
      const { data, error } = await supabase!.from("sanctions").select("id,type").eq("source_type", origen).eq("source_id", id).limit(1);
      if (error) throw error;
      return data[0] ?? null;
    },
  });
  if (consulta.isPending) return <p className="text-sm text-suave">Consultando sanción…</p>;
  if (consulta.isError) return <p role="alert">No se pudo consultar la sanción.</p>;
  if (consulta.data) return <p className="text-sm font-bold">Sanción registrada · {etiqueta(consulta.data.type)}</p>;
  if (!destinatario) return <p role="alert" className="text-sm text-error">No se pudo identificar a quién se sancionará.</p>;
  return <FormularioSancion id={id} origen={origen} destinatario={destinatario} />;
}

function SancionManual({ uid }: { uid: string }) {
  const [origen, setOrigen] = useState<"usuario" | "tienda">("usuario");
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<{ id: string; nombre: string } | null>(null);
  const termino = busqueda.trim();
  const resultados = useQuery({
    queryKey: ["casos", uid, "destinatarios-sancion", origen, termino],
    enabled: termino.length >= 2,
    queryFn: async () => {
      const columna = origen === "tienda" ? "name" : "full_name";
      const consulta = supabase!.from(origen === "tienda" ? "stores" : "profiles")
        .select(`id,nombre:${columna}`)
        .ilike(columna, `%${termino}%`).order(columna).limit(25);
      if (origen === "usuario") consulta.neq("id", uid);
      const { data, error } = await consulta;
      if (error) throw error;
      return data as unknown as { id: string; nombre: string }[];
    },
  });
  return (
    <details className="space-y-3 rounded-lg border border-borde bg-white p-4">
      <summary className="cursor-pointer font-bold text-mercado">Registrar sanción manual</summary>
      <label className="block text-sm font-bold">Tipo de destinatario
        <select className="mt-1 block min-h-11 rounded-lg border border-borde p-2" value={origen}
          onChange={(e) => { setOrigen(e.target.value === "tienda" ? "tienda" : "usuario"); setBusqueda(""); setElegido(null); }}>
          <option value="usuario">Cuenta de usuario</option>
          <option value="tienda">Tienda</option>
        </select>
      </label>
      <label className="block text-sm font-bold">Buscar por nombre
        <input className="mt-1 block w-full rounded-lg border border-borde p-2" value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setElegido(null); }} />
      </label>
      {termino.length >= 2 && (
        resultados.isPending ? <p role="status">Buscando…</p> :
        resultados.isError ? <p role="alert">No se pudieron consultar los destinatarios.</p> :
        resultados.data.length === 0 ? <p>No se encontraron coincidencias.</p> :
        <label className="block text-sm font-bold">Selecciona a quién sancionar
          <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde p-2" value={elegido?.id ?? ""}
            onChange={(e) => setElegido(resultados.data.find((destino) => destino.id === e.target.value) ?? null)}>
            <option value="">Selecciona un resultado</option>
            {resultados.data.map((destino) => <option key={destino.id} value={destino.id}>{destino.nombre} · {destino.id}</option>)}
          </select>
        </label>
      )}
      {elegido && <FormularioSancion key={elegido.id} id={elegido.id} origen={origen}
        destinatario={`${origen === "tienda" ? "Tienda" : "Cuenta"} · ${elegido.nombre} (${elegido.id})`} />}
    </details>
  );
}

function FichaReclamo({ caso, rol, uid, puedeResponder, acciones, enPedido }: { caso: Reclamo; enPedido: boolean; rol: Rol; uid: string; puedeResponder: boolean; acciones?: ReactNode }) {
  const abierto = caso.status === "abierto" || caso.status === "en_revision";
  const revisar = useCasosMutation(async () => accion("revisar_reclamo", { p_id: caso.id, p_resolucion: null, p_nota: null }));
  const respuestas = [...caso.claim_responses].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const color = caso.status === "abierto" ? "bg-amber-100 text-amber-900"
    : caso.status === "en_revision" ? "bg-blue-100 text-blue-900" : "bg-hoja text-pino";
  const entregado = ["entregado", "completada"].includes(caso.pedido_devolucion?.status ?? "");
  const opcionesResolucion = [
    ["cerrado_sin_incumplimiento", "Cierre sin incumplimiento"],
    ["acuerdo_partes:compra", "Acuerdo · Continuar la compra"],
    ["sancion:compra", "Incumplimiento con sanción · Continuar la compra"],
    ...(entregado ? [
      ["intercambio:intercambio", "Intercambio del producto"],
      ["acuerdo_partes:devolucion", "Acuerdo · Devolver el producto"],
      ["sancion:devolucion", "Incumplimiento con sanción · Devolver el producto"],
      ["sancion:intercambio", "Incumplimiento con sanción · Cambiar el producto"],
    ] as const : []),
  ] as const;
  const tieneAcciones = abierto || (rol === "admin" && caso.resolution === "sancion");
  return (
    <article className="min-w-0 space-y-5 rounded-xl border border-borde bg-white p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde pb-4">
        <div className="min-w-0 space-y-1">
          <h3 className="break-words font-display text-xl font-bold text-pino">{tiposReclamo.find(([id]) => id === caso.type)?.[1] ?? etiqueta(caso.type)}</h3>
          <p className="text-sm text-suave">Presentado el <time dateTime={caso.created_at}>{fecha(caso.created_at)}</time></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-bold capitalize ${color}`}>{etiqueta(caso.status)}</span>
          {acciones}
        </div>
      </header>

      <section className="space-y-3 rounded-lg bg-hoja/40 p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="font-bold text-pino">Comprador que presentó el reclamo</dt>
            <dd className="break-words">{caso.comprador?.full_name || (caso.buyer_id === uid ? "Tú" : "Nombre no disponible")}</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-bold text-pino">Tienda reclamada</dt>
            <dd className="break-words">{caso.tienda?.name || "Nombre no disponible"}</dd>
          </div>
        </dl>
        <div className="space-y-1 border-t border-borde pt-3">
          <h4 className="text-sm font-bold text-pino">Descripción del reclamo</h4>
          <p className="whitespace-pre-wrap break-words">{caso.description}</p>
        </div>
      </section>

      {rol === "admin"
        ? <ContextoPedido key={caso.order_id} id={caso.order_id} compradorId={caso.buyer_id} comprador={caso.comprador?.full_name} />
        : enPedido
          ? <Boton type="button" variante="contorno" onClick={() => document.getElementById("resumen-del-pedido")?.scrollIntoView({ block: "start" })}>Ver pedido</Boton>
          : <Link className={clasesBoton("contorno")} to={rutaPedido(rol, caso.order_id)} state={{ desdeReclamos: true }}>Ver pedido</Link>}

      <section className="space-y-2">
        <h4 className="font-bold text-pino">Respuestas al reclamo</h4>
        {respuestas.length === 0 ? <p className="text-sm text-suave">Todavía no hay respuestas.</p> : (
          <ol className="space-y-2">
            {respuestas.map((r) => {
              const comprador = r.author_id === caso.buyer_id;
              const nombre = comprador ? caso.comprador?.full_name : caso.tienda?.name;
              return (
                <li key={r.id} className="space-y-2 rounded-lg border border-borde p-3">
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                    <p className="break-words font-semibold text-pino">
                      {comprador ? "Comentario del comprador" : "Respuesta de la tienda"}
                      {nombre && ` · ${nombre}`}{r.author_id === uid && " (tú)"}
                    </p>
                    <time className="text-suave" dateTime={r.created_at}>{fecha(r.created_at)}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {(caso.claim_evidence.length > 0 || abierto) && (
        <div className="space-y-3 rounded-lg border border-borde p-4">
          <ArchivosCaso rutas={caso.claim_evidence.map((archivo) => archivo.file_path)} />
          {abierto && <AdjuntarEvidencia id={caso.id} uid={uid} />}
        </div>
      )}

      {caso.resolution && <section className="space-y-1 rounded-lg bg-hoja/40 p-4">
        <h4 className="font-bold text-pino">Decisión administrativa</h4>
        <p className="font-semibold">{resoluciones.find(([id]) => id === caso.resolution)?.[1] ?? etiqueta(caso.resolution)}</p>
        {caso.resolution_note && <p className="whitespace-pre-wrap break-words">{caso.resolution_note}</p>}
      </section>}

      <DevolucionReclamo id={caso.id} uid={uid} rol={rol} devolucion={caso.devolucion}
        entregado={entregado} resolucion={caso.resolution} />

      {tieneAcciones && (rol === "admin" || (puedeResponder && caso.buyer_id !== uid)) && (
        <div className="space-y-2 border-t border-borde pt-4">
          {abierto && puedeResponder && caso.buyer_id !== uid && (
            <FormularioCaso titulo="Responder al reclamo" minimo={1} repetir ejecutar={async (texto) => {
              const { error } = await supabase!.from("claim_responses").insert({ claim_id: caso.id, author_id: uid, body: texto });
              if (error) throw new Error(error.message);
            }} />
          )}
          {rol === "admin" && caso.status === "abierto" && <>
            <Boton variante="contorno" disabled={revisar.isPending} onClick={() => revisar.mutate()}>Marcar en revisión</Boton>
            {revisar.isError && <p role="alert" className="text-error">{revisar.error.message}</p>}
          </>}
          {rol === "admin" && abierto && <FormularioCaso titulo="Resolver reclamo" opciones={opcionesResolucion} confirmar etiquetaTexto="Motivo e instrucciones para las partes"
            ejecutar={(nota, opcion) => {
              const [resolucion, modalidad] = opcion.split(":");
              return accion("resolver_reclamo_con_seguimiento", { p_id: caso.id, p_resolucion: resolucion, p_nota: nota, p_modalidad: modalidad ?? null });
            }} />}
          {rol === "admin" && caso.resolution === "sancion" && <AplicarSancion id={caso.id} origen="reclamo"
            destinatario={caso.tienda?.name ? `Tienda · ${caso.tienda.name}` : null} />}
        </div>
      )}
    </article>
  );
}

function FichaCancelacion({ caso, rol, uid, acciones }: { caso: Cancelacion; rol: Rol; uid: string; acciones?: ReactNode }) {
  const autor = caso.cancelled_by === uid;
  const pendiente = caso.review_status === "denunciada";
  const abierta = caso.review_status === "sin_revision";
  const Detalles = rol === "admin" ? "details" : "div";
  const compradorId = caso.pedido?.buyer_id ?? caso.solicitud?.buyer_id;
  const nombreTienda = caso.pedido?.tienda?.name;
  const tituloDenuncia = caso.reported_by && compradorId
    ? caso.reported_by === compradorId ? "Denuncia del comprador" : "Denuncia de la tienda"
    : "Denuncia";
  const identificarParte = (id: string | null | undefined, persona: PersonaCaso | undefined) => {
    const nombre = persona?.full_name;
    const parte = !id || !compradorId ? "Sin identificar" : id === compradorId ? "Comprador" : nombreTienda ? "Tienda" : "Vendedor";
    return (
      <dl className="mt-1 space-y-1">
        <div><dt className="inline font-semibold">Parte: </dt><dd className="inline">{parte}</dd></div>
        {parte === "Tienda" && <div><dt className="inline font-semibold">Tienda: </dt><dd className="inline">{nombreTienda}</dd></div>}
        <div><dt className="inline font-semibold">Persona: </dt><dd className="inline">{nombre || "Sin identificar"}</dd></div>
      </dl>
    );
  };
  const contraparte = useQuery({
    queryKey: ["casos", "contraparte", caso.id, uid],
    enabled: rol !== "admin" && !autor && (abierta || pendiente),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("es_contraparte_cancelacion", { p_cancelacion: caso.id });
      if (error) throw error;
      return data === true;
    },
  });
  return (
    <article className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-pino">{caso.order_id ? "Cancelación de pedido" : "Cancelación de solicitud"} · {motivos.find(([id]) => id === caso.reason_code)?.[1] ?? etiqueta(caso.reason_code)}</h3>
        {acciones}
      </div>
      <EstadoCaso estado={caso.review_status} creado={caso.created_at} resaltar={rol === "admin"} />
      <Detalles className={rol === "admin" ? "space-y-3 rounded-lg border border-borde p-3" : "space-y-3"}>
        {rol === "admin" && <summary className="cursor-pointer font-bold text-mercado">Consultar detalles de la cancelación</summary>}
        <dl className="grid gap-3 rounded-lg bg-hoja/40 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold text-pino">Quién canceló</dt>
            <dd>{rol === "admin" ? identificarParte(caso.cancelled_by, caso.cancelador) : autor ? "Tú" : "Cuenta que canceló"}</dd>
          </div>
          <div>
            <dt className="font-bold text-pino">{caso.order_id ? "Pedido relacionado" : "Solicitud relacionada"}</dt>
            <dd className="break-all">{caso.order_id && rol !== "admin"
              ? <Link className="font-bold text-mercado underline" to={rutaPedido(rol, caso.order_id)}>Ver pedido</Link>
              : caso.order_id ?? caso.request_id ?? "Sin referencia"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-bold text-pino">Motivo indicado al cancelar</dt>
            <dd className="whitespace-pre-wrap break-words">{caso.reason_text || "No se indicó una explicación."}</dd>
          </div>
          {caso.report_text && <div className="sm:col-span-2">
            <dt className="font-bold text-pino">{tituloDenuncia}</dt>
            {rol === "admin" ? (
              <dd>
                {identificarParte(caso.reported_by, caso.denunciante)}
                <p className="mt-2 font-semibold text-pino">Mensaje de la denuncia</p>
                <p className="whitespace-pre-wrap break-words">{caso.report_text}</p>
              </dd>
            ) : <dd className="whitespace-pre-wrap break-words">{caso.report_text}</dd>}
          </div>}
          {caso.response_text && <div className="sm:col-span-2">
            <dt className="font-bold text-pino">Respuesta de quien canceló</dt>
            <dd className="whitespace-pre-wrap break-words">{caso.response_text}</dd>
          </div>}
          {caso.review_note && <div className="sm:col-span-2">
            <dt className="font-bold text-pino">Decisión administrativa{caso.revisor?.full_name && ` · ${caso.revisor.full_name}`}</dt>
            <dd className="whitespace-pre-wrap break-words">{caso.review_note}</dd>
          </div>}
        </dl>
        <ArchivosCaso rutas={caso.evidence_paths} />
        {rol === "admin" && caso.order_id && !abierta && <ContextoPedido key={caso.order_id} id={caso.order_id} />}
      </Detalles>
      {(abierta || pendiente) && (autor || contraparte.data) && <AdjuntarEvidencia id={caso.id} uid={uid} cancelacion />}
      {abierta && contraparte.data && <FormularioCaso titulo="Denunciar cancelación"
        ejecutar={(texto) => accion("responder_cancelacion", { p_id: caso.id, p_texto: texto, p_denuncia: true })} />}
      {pendiente && autor && !caso.response_text && <FormularioCaso titulo="Responder a la denuncia"
        ejecutar={(texto) => accion("responder_cancelacion", { p_id: caso.id, p_texto: texto, p_denuncia: false })} />}
      {pendiente && rol === "admin" && <FormularioCaso titulo="Resolver cancelación" confirmar
        opciones={[["justificada", "Justificada"], ["injustificada", "Injustificada"]]}
        ejecutar={(texto, opcion) => accion("revisar_cancelacion", { p_id: caso.id, p_justificada: opcion === "justificada", p_nota: texto })} />}
      {rol === "admin" && caso.review_status === "injustificada" && <AplicarSancion id={caso.id} origen="cancelacion"
        destinatario={!compradorId ? null : caso.cancelled_by === compradorId
          ? `Comprador · ${caso.cancelador?.full_name || caso.cancelled_by}`
          : nombreTienda ? `Tienda · ${nombreTienda}` : null} />}
    </article>
  );
}

function estadoSancion(caso: Sancion) {
  const ahora = Date.now();
  if (caso.revoked_at || caso.appeal_status === "aceptada") return "Revocada";
  if (caso.ends_at && Date.parse(caso.ends_at) <= ahora) return "Vencida";
  return Date.parse(caso.starts_at) > ahora ? "Programada" : "Activa";
}

function FichaSancion({ caso, rol, acciones }: { caso: Sancion; rol: Rol; acciones?: ReactNode }) {
  const decidir = useCasosMutation(async (aceptar: boolean) => accion("revisar_apelacion", { p_id: caso.id, p_aceptada: aceptar }));
  const estado = estadoSancion(caso);
  const revocada = estado === "Revocada";
  const activa = estado === "Activa";
  return (
    <article className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-bold capitalize text-pino">{etiqueta(caso.type)}</h3>
        {acciones}
      </div>
      <p className="text-sm font-bold">
        <span className={activa ? "text-amber-800" : "text-slate-600"}>{estado}</span>
        {" · "}{caso.store_id ? `Tienda${caso.tienda?.name ? ` · ${caso.tienda.name}` : ""}` : "Usuario"}
      </p>
      <p className="text-sm text-suave">{fecha(caso.created_at)}{caso.ends_at && ` · Hasta ${fecha(caso.ends_at)}`}</p>
      {rol !== "admin" && <p className="whitespace-pre-wrap break-words">{caso.reason}</p>}
      {caso.appeal_status && (
        <p className={`font-bold ${rol === "admin" ? colorEstadoCaso[caso.appeal_status] ?? "text-slate-600" : ""}`}>
          Apelación {caso.appeal_status}
        </p>
      )}
      {rol === "admin" ? (
        <details className="space-y-3 rounded-lg border border-borde p-3">
          <summary className="cursor-pointer font-bold text-marca">Consultar detalles de la sanción</summary>
          <dl className="grid gap-3 rounded-lg bg-fondo p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold text-pino">{caso.store_id ? "Cuenta de contacto" : "Cuenta sancionada"}</dt>
              <dd className="break-words">{caso.sancionado?.full_name?.trim() || caso.user_id}</dd>
            </div>
            {caso.tienda && <div>
              <dt className="font-bold text-pino">Tienda sancionada</dt>
              <dd>{caso.tienda.name}</dd>
            </div>}
            {caso.source_id && <div>
              <dt className="font-bold text-pino">Referencia del caso</dt>
              <dd className="break-all">{caso.source_id}</dd>
            </div>}
            <div className="sm:col-span-2">
              <dt className="font-bold text-pino">Motivo de la sanción</dt>
              <dd className="whitespace-pre-wrap break-words">{caso.reason}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-bold text-pino">Apelación de la cuenta sancionada</dt>
              <dd className="whitespace-pre-wrap break-words">{caso.appeal_text || "Aún no se ha presentado una apelación."}</dd>
            </div>
          </dl>
        </details>
      ) : caso.appeal_text && <p className="whitespace-pre-wrap break-words">{caso.appeal_text}</p>}
      {rol !== "admin" && caso.tienda && <p className="text-sm font-semibold">Tienda sancionada · {caso.tienda.name}</p>}
      {caso.revoked_at && <section className="rounded-lg bg-hoja/40 p-3 text-sm">
        <p className="font-bold text-pino">Motivo de revocación · {fecha(caso.revoked_at)}</p>
        <p className="whitespace-pre-wrap break-words">{caso.revocation_reason}</p>
      </section>}
      {rol === "admin" && activa && <FormularioCaso titulo="Revocar sanción" etiquetaTexto="Motivo de revocación" confirmar
        ejecutar={(texto) => accion("revocar_sancion", { p_id: caso.id, p_motivo: texto })} />}
      {rol !== "admin" && !revocada && !caso.appeal_status && <FormularioCaso titulo="Apelar sanción"
        ejecutar={(texto) => accion("apelar_sancion", { p_id: caso.id, p_texto: texto })} />}
      {rol === "admin" && !revocada && caso.appeal_status === "pendiente" && <div className="flex flex-wrap gap-2">
        <Boton disabled={decidir.isPending} onClick={() => { if (confirm("¿Aceptar la apelación?")) decidir.mutate(true); }}>Aceptar apelación</Boton>
        <Boton variante="contorno" disabled={decidir.isPending} onClick={() => { if (confirm("¿Rechazar la apelación?")) decidir.mutate(false); }}>Rechazar apelación</Boton>
      </div>}
      {decidir.isError && <p role="alert" className="text-error">{decidir.error.message}</p>}
    </article>
  );
}

type Clase = "reclamo" | "cancelacion" | "sancion";
const filtrosCaso: Record<Clase, string[]> = {
  reclamo: ["abierto", "en_revision", "resuelto", "cerrado"],
  cancelacion: ["sin_revision", "denunciada", "justificada", "injustificada"],
  sancion: ["activa", "vencida", "revocada", "programada"],
};
const select: Record<Clase, string> = {
  reclamo: "id,order_id,buyer_id,store_id,type,description,status,resolution,resolution_note,created_at,comprador:profiles!claims_buyer_id_fkey(full_name),tienda:stores!claims_store_id_fkey(name),claim_evidence(file_path),claim_responses(id,author_id,body,created_at),devolucion:claim_returns(estado,modalidad,instrucciones,evidencia,evidencia_tienda,nota),pedido_devolucion:orders!claims_order_id_fkey(status)",
  cancelacion: "id,order_id,request_id,cancelled_by,reason_code,reason_text,review_status,report_text,response_text,review_note,evidence_paths,created_at",
  sancion: "id,user_id,store_id,type,reason,starts_at,ends_at,source_type,source_id,appeal_text,appeal_status,revoked_at,revocation_reason,created_at,tienda:stores!sanctions_store_id_fkey(name)",
};

export function ListaCasos({ clase, rol, pedido, tiendas: idsTiendas, soloVigentes = false }: { clase: Clase; rol: Rol; pedido?: string; tiendas?: string[]; soloVigentes?: boolean }) {
  const uid = useUid();
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroApelacion, setFiltroApelacion] = useState("");
  const mostrarFiltros = rol === "admin" && !pedido;
  const tabla = tablaCasos(clase);
  const tiendas = useQuery({
    queryKey: ["casos", uid, "tiendas-pedidos"],
    enabled: Boolean(uid && supabase && rol === "vendedor" && clase === "reclamo"),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("tiendas_con_permiso", { perm: "gestionar_pedidos" });
      if (error) throw error;
      return new Set<string>(data ?? []);
    },
  });
  const consulta = useQuery({
    queryKey: ["casos", uid, clase, rol, pedido, idsTiendas, soloVigentes, filtroEstado, filtroApelacion],
    enabled: Boolean(uid && supabase),
    refetchInterval: clase === "sancion" || clase === "reclamo" ? 15_000 : false,
    queryFn: async () => {
      let columnas = select[clase];
      if (clase === "cancelacion") {
        columnas += ",reported_by,solicitud:requests!cancellations_request_id_fkey(buyer_id)";
        const tienda = rol === "admin" ? ",tienda:stores!orders_store_id_fkey(name)" : "";
        columnas += `,pedido:orders!cancellations_order_id_fkey(buyer_id${tienda})`;
        if (rol === "admin") {
          columnas += ",cancelador:profiles!cancellations_cancelled_by_fkey(full_name),denunciante:profiles!cancellations_reported_by_fkey(full_name),revisor:profiles!cancellations_reviewed_by_fkey(full_name)";
        }
      }
      if (rol === "admin" && clase === "sancion") {
        columnas += ",sancionado:profiles!sanctions_user_id_fkey(full_name)";
      }
      const base = supabase!.from(tabla).select(columnas);
      if (mostrarFiltros) base.is("admin_archived_at", null);
      if (mostrarFiltros && clase !== "sancion" && filtroEstado) {
        base.eq(clase === "reclamo" ? "status" : "review_status", filtroEstado);
      }
      if (mostrarFiltros && clase === "sancion") {
        const ahora = new Date().toISOString();
        if (filtroApelacion) base.eq("appeal_status", filtroApelacion);
        if (filtroEstado === "revocada") base.or("revoked_at.not.is.null,appeal_status.eq.aceptada");
        if (filtroEstado && filtroEstado !== "revocada") {
          base.is("revoked_at", null).or("appeal_status.is.null,appeal_status.neq.aceptada");
          if (filtroEstado === "activa") base.lte("starts_at", ahora).or(`ends_at.is.null,ends_at.gt.${ahora}`);
          if (filtroEstado === "vencida") base.lte("ends_at", ahora);
          if (filtroEstado === "programada") base.gt("starts_at", ahora).or(`ends_at.is.null,ends_at.gt.${ahora}`);
        }
      }
      if (pedido) base.eq("order_id", pedido);
      if (clase === "reclamo" && idsTiendas) base.in("store_id", idsTiendas);
      if (clase === "sancion" && soloVigentes) {
        const ahora = new Date().toISOString();
        base.eq("user_id", uid).is("store_id", null).is("revoked_at", null)
          .in("type", ["bloqueo", "suspension_temporal"]).lte("starts_at", ahora)
          .or(`ends_at.is.null,ends_at.gt.${ahora}`).or("appeal_status.is.null,appeal_status.neq.aceptada");
      }
      const { data, error } = await base.order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as (Reclamo | Cancelacion | Sancion)[];
    },
  });

  const accionesPapelera = useAccionesPapelera(tabla, mostrarFiltros ? consulta.data?.map((caso) => caso.id) ?? [] : []);
  const seleccion = useSeleccionPapelera(JSON.stringify([clase, filtroEstado, filtroApelacion]),
    mostrarFiltros && (filtroEstado || filtroApelacion) ? consulta.data?.map((caso) => caso.id) ?? [] : []);
  const reclamosTienda = rol === "vendedor" && clase === "reclamo";
  const historial = useHistorialPersonal(reclamosTienda ? "reclamos_tienda" : clase,
    (rol === "comprador" || reclamosTienda) && !pedido && !soloVigentes);
  const visibles = (consulta.data ?? []).filter((caso) => historial.visible(caso.id) || ("devolucion" in caso && devolucionPendiente(caso.devolucion)));
  const puedeQuitar = (caso: Reclamo | Cancelacion | Sancion) => {
    if ("review_status" in caso) return (caso.pedido?.buyer_id ?? caso.solicitud?.buyer_id) === uid
      && ["justificada", "injustificada"].includes(caso.review_status);
    if ("buyer_id" in caso) return (reclamosTienda ? caso.buyer_id !== uid : caso.buyer_id === uid)
      && ["resuelto", "cerrado"].includes(caso.status) && !devolucionPendiente(caso.devolucion);
    return caso.user_id === uid && caso.store_id === null && ["Revocada", "Vencida"].includes(estadoSancion(caso));
  };
  if (!supabase) return <p className="text-suave">Conecta Supabase para consultar los casos.</p>;
  return <div className="space-y-3">
    {mostrarFiltros && <FiltroEstado estados={filtrosCaso[clase]} valor={filtroEstado} cambiar={setFiltroEstado} />}
    {mostrarFiltros && clase === "sancion" && <FiltroEstado etiqueta="Estado de la apelación"
      estados={["pendiente", "aceptada", "rechazada"]} valor={filtroApelacion} cambiar={setFiltroApelacion} />}
    {mostrarFiltros && <SeleccionPapelera tabla={tabla} seleccion={seleccion} acciones={accionesPapelera} />}
    <SeleccionHistorial historial={historial} ids={visibles.filter(puedeQuitar).map((caso) => caso.id)} />
    {clase === "sancion" && rol === "admin" && <SancionManual uid={uid} />}
    {consulta.isPending && <p className="text-sm text-suave">Cargando…</p>}
    {consulta.isError && <p role="alert" className="text-error">No se pudieron cargar los casos.</p>}
    {consulta.isSuccess && visibles.length === 0 && !pedido && <p className="rounded-xl bg-white p-4 text-suave">No hay registros para este filtro.</p>}
    {visibles.map((caso) => {
      const accionPapelera = accionesPapelera?.get(caso.id);
      const acciones = mostrarFiltros && (accionPapelera || seleccion.visibles.includes(caso.id))
        ? <AccionesTarjeta tabla={tabla} id={caso.id} seleccion={seleccion} accion={accionPapelera} />
        : historial.listo && puedeQuitar(caso) ? <AccionHistorial historial={historial} id={caso.id} /> : null;
      if (clase === "reclamo") return <FichaReclamo key={caso.id} caso={caso as Reclamo} rol={rol} uid={uid} acciones={acciones} enPedido={Boolean(pedido)}
        puedeResponder={rol === "vendedor" && Boolean(tiendas.data?.has((caso as Reclamo).store_id))} />;
      if (clase === "cancelacion") return <FichaCancelacion key={caso.id} caso={caso as Cancelacion} rol={rol} uid={uid} acciones={acciones} />;
      return <FichaSancion key={caso.id} caso={caso as Sancion} rol={rol} acciones={acciones} />;
    })}
  </div>;
}
