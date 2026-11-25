import { soles } from "@/lib/format";
import Boton from "@/components/Boton";
import { accion, useCasosMutation } from "./casos";
import { AdjuntarEvidencia, ArchivosCaso } from "./EvidenciasCaso";
import { FormularioCaso } from "./FormularioCaso";

export type Devolucion = {
  flujo_nuevo: boolean;
  estado_previo: Devolucion["estado"] | null;
  conformidad_comprador_at: string | null;
  conformidad_tienda_at: string | null;
  reembolso_importe: number | null;
  reembolso_fecha: string | null;
  reembolso_metodo: string | null;
  reembolso_comprobante: string | null;
  estado: "por_sancionar" | "preparando" | "por_reembolsar" | "reembolso_autorizado" | "por_cerrar" | "ordenada" | "enviada" | "en_revision" | "recibida" | "cerrada" | "por_cumplir" | "por_confirmar" | "confirmada";
  modalidad: "devolucion" | "intercambio" | "compra";
  evidencia_tienda: string | null;
  instrucciones: string;
  evidencia: string | null;
  nota: string | null;
};

const estados: Record<Devolucion["estado"], string> = {
  por_sancionar: "Pendiente de sanción",
  preparando: "Preparando el producto para devolución",
  por_reembolsar: "Pendiente de autorización del reembolso",
  reembolso_autorizado: "Reembolso autorizado",
  por_cerrar: "Pendiente de conformidad de ambas partes",
  ordenada: "Pendiente de devolución",
  enviada: "Pendiente de confirmación de la tienda",
  en_revision: "En revisión administrativa",
  recibida: "Recepción confirmada por la tienda",
  cerrada: "Cerrada por administración",
  por_cumplir: "Pendiente de entrega acordada",
  por_confirmar: "Pendiente de confirmación del comprador",
  confirmada: "Cumplimiento confirmado por el comprador",
};

const movimientosReclamo: Record<string, string> = {
  ...estados,
  presentado: "Reclamo presentado",
  evaluacion: "Reclamo en revisión",
  conformidad: "Conformidad registrada",
  respuesta: "Respuesta registrada",
  evidencia: "Evidencia adjuntada",
};

type Movimiento = { id: number; actor_rol: string; etapa: string; creado_en: string };

function Seguimiento({ devolucion: d, resolucion }: { devolucion: Devolucion | null; resolucion: string | null }) {
  const etapas: [string, string][] = [["presentado", "Reclamo presentado"], ["evaluacion", "Reclamo evaluado"]];
  if (d?.modalidad === "compra") {
    if (resolucion === "sancion") etapas.push(["por_sancionar", "Incumplimiento confirmado y sanción pendiente"]);
    etapas.push(["por_cumplir", resolucion === "sancion" ? "Sanción aplicada y entrega autorizada" : "Entrega autorizada"], ["por_confirmar", "Entrega registrada"], ["por_cerrar", "Producto recibido"]);
  } else if (d?.modalidad === "intercambio") {
    etapas.push(["ordenada", "Intercambio autorizado"], ["enviada", "Producto original devuelto"],
      ["por_cumplir", "Original recibido y nuevo envío habilitado"], ["por_confirmar", "Reemplazo enviado"], ["por_cerrar", "Reemplazo recibido"]);
  } else if (d) {
    etapas.push(["ordenada", "Devolución autorizada"], ["preparando", "Producto en preparación"],
      ["enviada", "Producto enviado a la tienda"], ["por_reembolsar", "Producto recibido y reembolso habilitado"],
      ["reembolso_autorizado", "Reembolso autorizado"], ["por_confirmar", "Dinero devuelto"], ["por_cerrar", "Reembolso confirmado"]);
  }
  if (d) etapas.push(["confirmada", "Seguimiento finalizado"]);
  const actual = d ? etapas.findIndex(([clave]) => clave === (d.estado === "en_revision" ? d.estado_previo : d.estado)) : 0;
  return <ol aria-label="Etapas del reclamo" className="flex flex-wrap gap-2">
    {etapas.map(([clave, titulo], indice) => {
      const hecho = indice < actual || d?.estado === "confirmada";
      const ahora = indice === actual && !hecho;
      return (
        <li key={clave} aria-current={ahora ? "step" : undefined}
          className={`max-w-full rounded-full px-3 py-1 text-sm font-bold ${hecho ? "bg-hoja text-pino" : ahora ? "bg-maiz text-tinta" : "border border-borde bg-white text-suave"}`}>
          {hecho ? "✓ " : ""}{titulo}
        </li>
      );
    })}
  </ol>;
}

export function devolucionPendiente(devolucion: Devolucion | null) {
  return Boolean(devolucion && !["recibida", "cerrada", "confirmada"].includes(devolucion.estado));
}

export default function DevolucionReclamo({ id, uid, rol, devolucion, entregado, resolucion, movimientos, estadoReclamo, comprador, tienda }: {
  id: string; uid: string; rol: "admin" | "comprador" | "vendedor"; devolucion: Devolucion | null; entregado: boolean; resolucion: string | null; movimientos: Movimiento[]; estadoReclamo: string; comprador?: string; tienda?: string;
}) {
  const ejecutar = (tarea: string, nota?: string) =>
    accion("gestionar_devolucion", { p_reclamo: id, p_accion: tarea, p_nota: nota ?? null });
  const confirmar = useCasosMutation(() => ejecutar(rol === "comprador" ? "confirmar_cumplimiento" : "recibir"));

  const cambiar = useCasosMutation((tarea: string) => ejecutar(tarea));
  const historial = movimientos.length > 0 && (
    <details className="rounded-lg border border-borde bg-white p-3">
      <summary className="cursor-pointer font-bold text-mercado">Historial de movimientos</summary>
      <ol className="mt-3 divide-y divide-borde text-sm">
        {[...movimientos].sort((a, b) => a.id - b.id).map((evento) => (
          <li key={evento.id} className="flex flex-wrap justify-between gap-1 py-2">
            <span>{evento.actor_rol} · {movimientosReclamo[evento.etapa] ?? evento.etapa}</span>
            <time className="text-suave" dateTime={evento.creado_en}>{new Date(evento.creado_en).toLocaleString("es-PE")}</time>
          </li>
        ))}
      </ol>
    </details>
  );
  if (!devolucion) return (
    <section className="space-y-3 rounded-lg border border-borde bg-hoja/40 p-4">
      <h4 className="font-bold text-pino">Seguimiento del reclamo</h4>
      {estadoReclamo === "abierto" || estadoReclamo === "en_revision" ? <p className="text-sm text-suave">El administrador revisará el reclamo y habilitará los siguientes pasos.</p> : null}
      {rol === "admin" && entregado && resolucion && resolucion !== "cerrado_sin_incumplimiento" && (
        <FormularioCaso titulo={resolucion === "intercambio" ? "Iniciar intercambio" : "Ordenar devolución"}
          etiquetaTexto="Instrucciones para devolver el producto" confirmar ejecutar={(nota) => ejecutar("ordenar", nota)} />
      )}
      {historial}
    </section>
  );

  const pendiente = devolucionPendiente(devolucion);
  const remitenteComprador = comprador ? `el comprador · ${comprador}` : "el comprador";
  const remitenteTienda = tienda ? `la tienda · ${tienda}` : "la tienda";
  const evidencias = [
    { ruta: devolucion.evidencia, etapa: devolucion.modalidad === "intercambio" ? "Devolución del producto original" : "Envío del producto a la tienda", remitente: remitenteComprador },
    { ruta: devolucion.evidencia_tienda, etapa: devolucion.modalidad === "intercambio" ? "Envío del reemplazo" : "Entrega del producto acordado", remitente: remitenteTienda },
    { ruta: devolucion.reembolso_comprobante, etapa: "Reembolso del dinero", remitente: remitenteTienda },
  ].filter((archivo): archivo is { ruta: string; etapa: string; remitente: string } => Boolean(archivo.ruta));
  return (
    <section id={`seguimiento-${id}`} tabIndex={-1} className="space-y-4">
      <div className="space-y-3 rounded-xl border border-borde bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-pino">{devolucion.modalidad === "compra" ? "Continuación de la compra"
            : devolucion.modalidad === "intercambio" ? "Intercambio del producto" : "Devolución del producto"}</h4>
          <span className="rounded-full bg-hoja px-3 py-1 text-sm font-semibold text-pino">{estados[devolucion.estado]}</span>
        </div>
        {devolucion.flujo_nuevo && <div className="space-y-2 border-t border-borde pt-3">
          <h5 className="text-sm font-bold text-pino">Seguimiento del reclamo</h5>
          <Seguimiento devolucion={devolucion} resolucion={resolucion} />
        </div>}
        <p className="whitespace-pre-wrap break-words">{devolucion.instrucciones}</p>
        {devolucion.nota && <p className="whitespace-pre-wrap break-words text-sm"><strong>Última intervención</strong><br />{devolucion.nota}</p>}
        <ArchivosCaso miniaturas rutas={evidencias.map(({ ruta }) => ruta)}
          datosPorRuta={Object.fromEntries(evidencias.map((archivo) => [archivo.ruta, archivo]))} />
        {devolucion.reembolso_importe !== null && <p className="text-sm"><strong>Importe autorizado</strong> {soles(Number(devolucion.reembolso_importe))}
          {devolucion.reembolso_fecha && ` · ${devolucion.reembolso_fecha}`}{devolucion.reembolso_metodo && ` · ${devolucion.reembolso_metodo}`}</p>}
      </div>
      {pendiente && <div className="space-y-3 rounded-xl border border-borde bg-white p-4 sm:p-5">
        <h5 className="font-display text-lg font-bold text-pino">Siguiente paso</h5>
        <p className="text-sm text-suave">{estados[devolucion.estado]}.</p>
        {rol === "vendedor" && devolucion.estado === "por_cumplir" && ((entregado || devolucion.flujo_nuevo)
          ? <AdjuntarEvidencia id={id} uid={uid} cumplimiento />
          : <p className="text-sm text-suave">Completa la entrega desde el pedido y luego adjunta el comprobante aquí.</p>)}
        {rol === "comprador" && devolucion.estado === "por_confirmar" && <>
          <Boton type="button" variante="secundario" disabled={confirmar.isPending} onClick={() => {
            if (confirm(devolucion.modalidad === "devolucion" ? "¿Confirmas que recibiste el reembolso?" : "¿Confirmas que recibiste el producto acordado?")) confirmar.mutate();
          }}>{devolucion.modalidad === "devolucion" ? "Confirmar dinero recibido" : "Confirmar producto recibido"}</Boton>
          {confirmar.isError && <p role="alert" className="text-sm text-error">{confirmar.error.message}</p>}
        </>}
        {rol === "comprador" && devolucion.estado === "ordenada" && devolucion.flujo_nuevo && devolucion.modalidad === "devolucion" &&
          <Boton type="button" disabled={cambiar.isPending} onClick={() => cambiar.mutate("preparar")}>Preparar devolución</Boton>}
        {rol === "comprador" && (devolucion.estado === "preparando" || (devolucion.estado === "ordenada" &&
          (!devolucion.flujo_nuevo || devolucion.modalidad !== "devolucion"))) && <AdjuntarEvidencia id={id} uid={uid} devolucion />}
        {rol === "admin" && devolucion.estado === "por_reembolsar" && <FormularioCaso titulo="Autorizar reembolso"
          etiquetaTexto="Indicaciones para devolver el importe de la compra" confirmar ejecutar={(nota) => ejecutar("autorizar_reembolso", nota)} />}
        {rol === "vendedor" && devolucion.estado === "reembolso_autorizado" && <AdjuntarEvidencia id={id} uid={uid} reembolso />}
        {devolucion.estado === "por_cerrar" && <>
          <p className="text-sm">Comprador · {devolucion.conformidad_comprador_at ? "Conforme" : "Por confirmar"}</p>
          <p className="text-sm">Tienda · {devolucion.conformidad_tienda_at ? "Conforme" : "Por confirmar"}</p>
          {rol !== "admin" && !(rol === "comprador" ? devolucion.conformidad_comprador_at : devolucion.conformidad_tienda_at) &&
            <Boton type="button" disabled={cambiar.isPending} onClick={() => {
              if (confirm("¿Confirmas que estás conforme con el cumplimiento de la resolución?")) cambiar.mutate("conformidad");
            }}>Confirmar conformidad</Boton>}
        </>}
        {cambiar.isError && <p role="alert" className="text-sm text-error">{cambiar.error.message}</p>}
        {rol === "vendedor" && devolucion.estado === "enviada" && <>
          <Boton type="button" variante="secundario" disabled={confirmar.isPending} onClick={() => {
            if (confirm("¿Confirmas que la tienda recuperó el producto?")) confirmar.mutate();
          }}>Confirmar recepción</Boton>
          {confirmar.isError && <p role="alert" className="text-sm text-error">{confirmar.error.message}</p>}
        </>}
      </div>}
      {rol !== "admin" && pendiente && !["en_revision", "por_sancionar"].includes(devolucion.estado) && (
        <FormularioCaso titulo="Solicitar intervención" etiquetaTexto="¿Qué ocurrió con el seguimiento?"
          ejecutar={(nota) => ejecutar("intervenir", nota)} />
      )}
      {rol === "admin" && pendiente && <>
        {!["en_revision", "por_sancionar"].includes(devolucion.estado) && <FormularioCaso titulo="Poner seguimiento en revisión" etiquetaTexto="Motivo de la revisión"
          confirmar ejecutar={(nota) => ejecutar("intervenir", nota)} />}
        {devolucion.estado === "en_revision" && <FormularioCaso titulo="Reanudar seguimiento" etiquetaTexto="Indicaciones para continuar"
          confirmar ejecutar={(nota) => ejecutar("reanudar", nota)} />}
        {!devolucion.flujo_nuevo && <FormularioCaso titulo="Cerrar seguimiento" etiquetaTexto="Motivo del cierre administrativo"
          confirmar ejecutar={(nota) => ejecutar("cerrar", nota)} />}
      </>}
      {historial}
    </section>
  );
}
