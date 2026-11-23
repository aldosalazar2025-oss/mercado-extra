import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
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
  claim_evidence: { file_path: string }[];
  claim_responses: { id: string; author_id: string; body: string; created_at: string }[];
};
type Cancelacion = Base & {
  order_id: string | null; request_id: string | null; cancelled_by: string; reason_code: string; reason_text: string | null;
  review_status: string; report_text: string | null; response_text: string | null; review_note: string | null; evidence_paths: string[];
};
type Sancion = Base & {
  user_id: string; type: string; reason: string; ends_at: string | null; source_id: string | null;
  source_type: string | null; appeal_text: string | null; appeal_status: string | null;
};

const fecha = (valor: string) => new Date(valor).toLocaleString("es-PE");

function AplicarSancion({ id, origen }: { id: string; origen: "reclamo" | "cancelacion" }) {
  const consulta = useQuery({
    queryKey: ["casos", "sancion", origen, id],
    queryFn: async () => {
      const { data, error } = await supabase!.from("sanctions").select("id,type").eq("source_type", origen).eq("source_id", id).limit(1);
      if (error) throw error;
      return data[0];
    },
  });
  if (consulta.isPending) return <p className="text-sm text-suave">Consultando sanción…</p>;
  if (consulta.isError) return <p role="alert">No se pudo consultar la sanción.</p>;
  if (consulta.data) return <p className="text-sm font-bold">Sanción registrada · {etiqueta(consulta.data.type)}</p>;
  return <FormularioCaso titulo="Aplicar sanción" opciones={tiposSancion} pedirDias confirmar
    ejecutar={(texto, tipo, dias) => accion("aplicar_sancion", { p_id: id, p_origen: origen, p_tipo: tipo, p_dias: dias, p_motivo: texto })} />;
}

function FichaReclamo({ caso, rol, uid, puedeResponder }: { caso: Reclamo; rol: Rol; uid: string; puedeResponder: boolean }) {
  const abierto = caso.status === "abierto" || caso.status === "en_revision";
  const revisar = useCasosMutation(async () => accion("revisar_reclamo", { p_id: caso.id, p_resolucion: null, p_nota: null }));
  const respuestas = [...caso.claim_responses].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <article className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold text-pino">{tiposReclamo.find(([id]) => id === caso.type)?.[1] ?? etiqueta(caso.type)}</h3>
      <p className="text-sm text-suave capitalize">{etiqueta(caso.status)} · {fecha(caso.created_at)}</p>
      <section className="space-y-1 rounded-lg border border-borde bg-white p-3">
        <h4 className="font-bold text-pino">Reclamo del comprador{caso.comprador?.full_name && ` · ${caso.comprador.full_name}`}</h4>
        {caso.tienda?.name && <p className="text-sm text-suave">Tienda reclamada · {caso.tienda.name}</p>}
        <p className="whitespace-pre-wrap break-words">{caso.description}</p>
      </section>
      {rol === "admin"
        ? <ContextoPedido key={caso.order_id} id={caso.order_id} compradorId={caso.buyer_id} comprador={caso.comprador?.full_name} />
        : <Link className="text-sm font-bold text-mercado underline" to={rutaPedido(rol, caso.order_id)}>Ver pedido</Link>}
      <ArchivosCaso rutas={caso.claim_evidence.map((archivo) => archivo.file_path)} />
      <section className="space-y-2 rounded-lg bg-hoja p-3">
        <h4 className="font-bold text-pino">Respuestas al reclamo</h4>
        {respuestas.length === 0 && <p className="text-sm text-suave">Todavía no hay respuestas.</p>}
        {respuestas.map((r) => <div key={r.id}>
          <p className="text-sm text-suave">{r.author_id === caso.buyer_id ? "Comentario del comprador" : "Respuesta de la tienda"}
            {r.author_id === uid ? " (tú)" : r.author_id === caso.buyer_id && caso.comprador?.full_name ? ` · ${caso.comprador.full_name}` : r.author_id !== caso.buyer_id && caso.tienda?.name ? ` · ${caso.tienda.name}` : ""} · {fecha(r.created_at)}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>
        </div>)}
      </section>
      {caso.resolution && <section className="space-y-1 rounded-lg border border-borde bg-white p-3">
        <h4 className="font-bold text-pino">Decisión administrativa</h4>
        <p className="font-semibold">{resoluciones.find(([id]) => id === caso.resolution)?.[1] ?? etiqueta(caso.resolution)}</p>
        {caso.resolution_note && <p className="whitespace-pre-wrap break-words">{caso.resolution_note}</p>}
      </section>}
      {abierto && <AdjuntarEvidencia id={caso.id} uid={uid} />}
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
      {rol === "admin" && abierto && <FormularioCaso titulo="Resolver reclamo" opciones={resoluciones} confirmar
        ejecutar={(nota, resolucion) => accion("revisar_reclamo", { p_id: caso.id, p_resolucion: resolucion, p_nota: nota })} />}
      {rol === "admin" && caso.resolution === "sancion" && <AplicarSancion id={caso.id} origen="reclamo" />}
    </article>
  );
}

function FichaCancelacion({ caso, rol, uid }: { caso: Cancelacion; rol: Rol; uid: string }) {
  const autor = caso.cancelled_by === uid;
  const pendiente = caso.review_status === "denunciada";
  const abierta = caso.review_status === "sin_revision";
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
      <h3 className="font-display text-lg font-bold text-pino">{caso.order_id ? "Cancelación de pedido" : "Cancelación de solicitud"} · {motivos.find(([id]) => id === caso.reason_code)?.[1] ?? etiqueta(caso.reason_code)}</h3>
      <p className="text-sm text-suave capitalize">{etiqueta(caso.review_status)} · {fecha(caso.created_at)}</p>
      {caso.order_id && rol !== "admin"
        ? <Link className="text-sm font-bold text-mercado underline" to={rutaPedido(rol, caso.order_id)}>Ver pedido</Link>
        : <p className="break-all text-sm text-suave">Referencia {caso.order_id ?? caso.request_id}</p>}
      {caso.reason_text && <p className="whitespace-pre-wrap break-words">{caso.reason_text}</p>}
      {caso.report_text && <p className="whitespace-pre-wrap break-words"><strong>Denuncia</strong> · {caso.report_text}</p>}
      {caso.response_text && <p className="whitespace-pre-wrap break-words"><strong>Respuesta</strong> · {caso.response_text}</p>}
      {caso.review_note && <p className="whitespace-pre-wrap break-words"><strong>Decisión</strong> · {caso.review_note}</p>}
      {rol === "admin" && caso.order_id && !abierta && <ContextoPedido key={caso.order_id} id={caso.order_id} />}
      <ArchivosCaso rutas={caso.evidence_paths} />
      {(abierta || pendiente) && (autor || contraparte.data) && <AdjuntarEvidencia id={caso.id} uid={uid} cancelacion />}
      {abierta && contraparte.data && <FormularioCaso titulo="Denunciar cancelación"
        ejecutar={(texto) => accion("responder_cancelacion", { p_id: caso.id, p_texto: texto, p_denuncia: true })} />}
      {pendiente && autor && !caso.response_text && <FormularioCaso titulo="Responder a la denuncia"
        ejecutar={(texto) => accion("responder_cancelacion", { p_id: caso.id, p_texto: texto, p_denuncia: false })} />}
      {pendiente && rol === "admin" && <FormularioCaso titulo="Resolver cancelación" confirmar
        opciones={[["justificada", "Justificada"], ["injustificada", "Injustificada"]]}
        ejecutar={(texto, opcion) => accion("revisar_cancelacion", { p_id: caso.id, p_justificada: opcion === "justificada", p_nota: texto })} />}
      {rol === "admin" && caso.review_status === "injustificada" && <AplicarSancion id={caso.id} origen="cancelacion" />}
    </article>
  );
}

function FichaSancion({ caso, rol }: { caso: Sancion; rol: Rol }) {
  const decidir = useCasosMutation(async (aceptar: boolean) => accion("revisar_apelacion", { p_id: caso.id, p_aceptada: aceptar }));
  return (
    <article className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold capitalize text-pino">{etiqueta(caso.type)}</h3>
      <p className="text-sm text-suave">{fecha(caso.created_at)}{caso.ends_at && ` · Hasta ${fecha(caso.ends_at)}`}</p>
      <p className="whitespace-pre-wrap break-words">{caso.reason}</p>
      {rol === "admin" && <p className="break-all text-sm text-suave">Cuenta {caso.user_id}{caso.source_id && ` · Caso ${caso.source_id}`}</p>}
      {caso.appeal_status && <p className="font-bold">Apelación {caso.appeal_status}</p>}
      {caso.appeal_text && <p className="whitespace-pre-wrap break-words">{caso.appeal_text}</p>}
      {rol !== "admin" && !caso.appeal_status && <FormularioCaso titulo="Apelar sanción"
        ejecutar={(texto) => accion("apelar_sancion", { p_id: caso.id, p_texto: texto })} />}
      {rol === "admin" && caso.appeal_status === "pendiente" && <div className="flex flex-wrap gap-2">
        <Boton disabled={decidir.isPending} onClick={() => { if (confirm("¿Aceptar la apelación?")) decidir.mutate(true); }}>Aceptar apelación</Boton>
        <Boton variante="contorno" disabled={decidir.isPending} onClick={() => { if (confirm("¿Rechazar la apelación?")) decidir.mutate(false); }}>Rechazar apelación</Boton>
      </div>}
      {decidir.isError && <p role="alert" className="text-error">{decidir.error.message}</p>}
    </article>
  );
}

type Clase = "reclamo" | "cancelacion" | "sancion";
const select: Record<Clase, string> = {
  reclamo: "id,order_id,buyer_id,store_id,type,description,status,resolution,resolution_note,created_at,comprador:profiles!claims_buyer_id_fkey(full_name),tienda:stores!claims_store_id_fkey(name),claim_evidence(file_path),claim_responses(id,author_id,body,created_at)",
  cancelacion: "id,order_id,request_id,cancelled_by,reason_code,reason_text,review_status,report_text,response_text,review_note,evidence_paths,created_at",
  sancion: "id,user_id,type,reason,ends_at,source_type,source_id,appeal_text,appeal_status,created_at",
};

export function ListaCasos({ clase, rol, pedido, tiendas: idsTiendas, soloVigentes = false }: { clase: Clase; rol: Rol; pedido?: string; tiendas?: string[]; soloVigentes?: boolean }) {
  const uid = useUid();
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
    queryKey: ["casos", uid, clase, rol, pedido, idsTiendas, soloVigentes],
    enabled: Boolean(uid && supabase),
    queryFn: async () => {
      const base = supabase!.from(tablaCasos(clase)).select(select[clase]);
      if (pedido) base.eq("order_id", pedido);
      if (clase === "reclamo" && idsTiendas) base.in("store_id", idsTiendas);
      if (clase === "sancion" && rol !== "admin") base.eq("user_id", uid);
      if (clase === "sancion" && soloVigentes) {
        const ahora = new Date().toISOString();
        base.in("type", ["bloqueo", "suspension_temporal"]).lte("starts_at", ahora)
          .or(`ends_at.is.null,ends_at.gt.${ahora}`).or("appeal_status.is.null,appeal_status.neq.aceptada");
      }
      const { data, error } = await base.order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as (Reclamo | Cancelacion | Sancion)[];
    },
  });

  if (!supabase) return <p className="text-suave">Conecta Supabase para consultar los casos.</p>;
  if (consulta.isPending) return <p className="text-sm text-suave">Cargando…</p>;
  if (consulta.isError) return <p role="alert" className="text-error">No se pudieron cargar los casos.</p>;
  if (!consulta.data.length) return pedido ? null : <p className="rounded-xl bg-white p-4 text-suave">Aún no hay registros.</p>;
  return <div className="space-y-3">{consulta.data.map((caso) => {
    if (clase === "reclamo") {
      const reclamo = caso as Reclamo;
      const puedeResponder = rol === "vendedor" && Boolean(tiendas.data?.has(reclamo.store_id));
      return <FichaReclamo key={caso.id} caso={reclamo} rol={rol} uid={uid} puedeResponder={puedeResponder} />;
    }
    if (clase === "cancelacion") return <FichaCancelacion key={caso.id} caso={caso as Cancelacion} rol={rol} uid={uid} />;
    return <FichaSancion key={caso.id} caso={caso as Sancion} rol={rol} />;
  })}</div>;
}
