import Boton from "@/components/Boton";
import { accion, useCasosMutation } from "./casos";
import { AdjuntarEvidencia, ArchivosCaso } from "./EvidenciasCaso";
import { FormularioCaso } from "./FormularioCaso";

export type Devolucion = {
  estado: "ordenada" | "enviada" | "en_revision" | "recibida" | "cerrada" | "por_cumplir" | "por_confirmar" | "confirmada";
  modalidad: "devolucion" | "intercambio" | "compra";
  evidencia_tienda: string | null;
  instrucciones: string;
  evidencia: string | null;
  nota: string | null;
};

const estados: Record<Devolucion["estado"], string> = {
  ordenada: "Pendiente de devolución",
  enviada: "Pendiente de confirmación de la tienda",
  en_revision: "En revisión administrativa",
  recibida: "Recepción confirmada por la tienda",
  cerrada: "Cerrada por administración",
  por_cumplir: "Pendiente de entrega acordada",
  por_confirmar: "Pendiente de confirmación del comprador",
  confirmada: "Cumplimiento confirmado por el comprador",
};

export function devolucionPendiente(devolucion: Devolucion | null) {
  return Boolean(devolucion && !["recibida", "cerrada", "confirmada"].includes(devolucion.estado));
}

export default function DevolucionReclamo({ id, uid, rol, devolucion, entregado, resolucion }: {
  id: string; uid: string; rol: "admin" | "comprador" | "vendedor"; devolucion: Devolucion | null; entregado: boolean; resolucion: string | null;
}) {
  const ejecutar = (tarea: string, nota?: string) =>
    accion("gestionar_devolucion", { p_reclamo: id, p_accion: tarea, p_nota: nota ?? null });
  const confirmar = useCasosMutation(() => ejecutar(rol === "comprador" ? "confirmar_cumplimiento" : "recibir"));

  if (!devolucion) return rol === "admin" && entregado && resolucion && resolucion !== "cerrado_sin_incumplimiento" ? (
    <FormularioCaso titulo={resolucion === "intercambio" ? "Iniciar intercambio" : "Ordenar devolución"} etiquetaTexto="Instrucciones para devolver el producto"
      confirmar ejecutar={(nota) => ejecutar("ordenar", nota)} />
  ) : null;

  const pendiente = devolucionPendiente(devolucion);
  return (
    <section className="space-y-3 rounded-lg border border-borde bg-hoja/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-pino">{devolucion.modalidad === "compra" ? "Continuación de la compra"
          : devolucion.modalidad === "intercambio" ? "Intercambio del producto" : "Devolución del producto"}</h4>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-pino">{estados[devolucion.estado]}</span>
      </div>
      <p className="whitespace-pre-wrap break-words">{devolucion.instrucciones}</p>
      {devolucion.nota && <p className="whitespace-pre-wrap break-words text-sm"><strong>Última intervención</strong><br />{devolucion.nota}</p>}
      <ArchivosCaso rutas={[devolucion.evidencia, devolucion.evidencia_tienda].filter((ruta): ruta is string => Boolean(ruta))} />
      {rol === "vendedor" && devolucion.estado === "por_cumplir" && (entregado
        ? <AdjuntarEvidencia id={id} uid={uid} cumplimiento />
        : <p className="text-sm text-suave">Completa la entrega desde el pedido y luego adjunta el comprobante aquí.</p>)}
      {rol === "comprador" && devolucion.estado === "por_confirmar" && <>
        <Boton type="button" variante="secundario" disabled={confirmar.isPending} onClick={() => {
          if (confirm("¿Confirmas que recibiste lo acordado y quieres cerrar la compra?")) confirmar.mutate();
        }}>Confirmar cumplimiento</Boton>
        {confirmar.isError && <p role="alert" className="text-sm text-error">{confirmar.error.message}</p>}
      </>}
      {rol === "comprador" && devolucion.estado === "ordenada" && <AdjuntarEvidencia id={id} uid={uid} devolucion />}
      {rol === "vendedor" && devolucion.estado === "enviada" && <>
        <Boton type="button" variante="secundario" disabled={confirmar.isPending} onClick={() => {
          if (confirm("¿Confirmas que la tienda recuperó el producto?")) confirmar.mutate();
        }}>Confirmar recepción</Boton>
        {confirmar.isError && <p role="alert" className="text-sm text-error">{confirmar.error.message}</p>}
      </>}
      {rol !== "admin" && pendiente && devolucion.estado !== "en_revision" && (
        <FormularioCaso titulo="Solicitar intervención" etiquetaTexto="¿Qué ocurrió con el seguimiento?"
          ejecutar={(nota) => ejecutar("intervenir", nota)} />
      )}
      {rol === "admin" && pendiente && <>
        {devolucion.estado !== "en_revision" && <FormularioCaso titulo="Poner seguimiento en revisión" etiquetaTexto="Motivo de la revisión"
          confirmar ejecutar={(nota) => ejecutar("intervenir", nota)} />}
        {devolucion.estado === "en_revision" && <FormularioCaso titulo="Reanudar seguimiento" etiquetaTexto="Indicaciones para continuar"
          confirmar ejecutar={(nota) => ejecutar("reanudar", nota)} />}
        <FormularioCaso titulo="Cerrar seguimiento" etiquetaTexto="Motivo del cierre administrativo"
          confirmar ejecutar={(nota) => ejecutar("cerrar", nota)} />
      </>}
    </section>
  );
}
