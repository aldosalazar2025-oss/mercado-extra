import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { accion, useCasosMutation } from "@/features/reclamos/casos";
import { AdjuntarEvidencia, ArchivosCaso } from "@/features/reclamos/EvidenciasCaso";
import { FormularioCaso } from "@/features/reclamos/FormularioCaso";
import { supabase } from "@/lib/supabase";
import type { EstadoPedido } from "./tipos";

export type ControlCierre = {
  reporte: "pendiente" | "aceptado" | "rechazado" | null;
  evidencia: string | null;
  nota_reporte: string | null;
  decision_entrega: string | null;
  comprador_confirmo_at: string | null;
  tienda_confirmo_at: string | null;
  intervencion: string | null;
  cierre_admin: string | null;
};

export function useControlCierre(id: string, uid: string) {
  return useQuery({
    queryKey: ["casos", "cierre-pedido", uid, id],
    enabled: Boolean(supabase && uid && id),
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase!.from("order_close_control").select("*").eq("order_id", id).maybeSingle<ControlCierre>();
      if (error) throw error;
      return data;
    },
  });
}

export default function CierrePedido({ id, uid, rol, estado, control }: {
  id: string; uid: string; rol: "comprador" | "vendedor" | "admin";
  estado: EstadoPedido; control: ControlCierre | null;
}) {
  const ejecutar = (tarea: string, nota?: string) =>
    accion("gestionar_cierre_pedido", { p_order: id, p_accion: tarea, p_nota: nota ?? null });
  const confirmar = useCasosMutation(() => ejecutar(rol === "comprador" ? "confirmar_comprador" : "confirmar_tienda"));
  const pendiente = control?.reporte === "pendiente";
  const reportable = rol === "vendedor" && !pendiente && ["enviado_o_listo", "pendiente_confirmacion"].includes(estado);
  const miConfirmacion = rol === "comprador" ? control?.comprador_confirmo_at : control?.tienda_confirmo_at;
  if (!control && !reportable && estado !== "entregado") return null;
  return (
    <section className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold text-pino">Entrega y cierre de la operación</h3>
      {control?.reporte && <div className="space-y-2 rounded-lg bg-hoja/40 p-3">
        <p className="font-semibold">{pendiente ? "Entrega en disputa"
          : control.reporte === "aceptado" ? "Entrega validada por administración" : "Reporte de entrega rechazado"}</p>
        {control.nota_reporte && <p className="whitespace-pre-wrap break-words">{control.nota_reporte}</p>}
        {control.evidencia && <ArchivosCaso rutas={[control.evidencia]} />}
        {control.decision_entrega && <p className="whitespace-pre-wrap break-words">Decisión de administración · {control.decision_entrega}</p>}
        {rol === "admin" && pendiente && <FormularioCaso titulo="Resolver entrega sin código" etiquetaTexto="Motivo de la decisión" confirmar
          opciones={[["validar_entrega", "Confirmar que el producto fue entregado"], ["rechazar_entrega", "Rechazar el reporte de entrega"]]}
          ejecutar={(nota, tarea) => ejecutar(tarea, nota)} />}
      </div>}
      {reportable && <details className="space-y-3 rounded-lg border border-borde p-3">
        <summary className="cursor-pointer font-bold text-mercado">Reportar entrega sin código</summary>
        <AdjuntarEvidencia id={id} uid={uid} entregaSinCodigo />
      </details>}
      {(estado === "entregado" || control?.comprador_confirmo_at || control?.tienda_confirmo_at) && (
        <ul className="space-y-1 text-sm">
          <li>Comprador · {control?.comprador_confirmo_at ? "Confirmado" : "Por confirmar"}</li>
          <li>Tienda · {control?.tienda_confirmo_at ? "Confirmado" : "Por confirmar"}</li>
        </ul>
      )}
      {control?.intervencion && <p className="whitespace-pre-wrap break-words text-sm">Intervención solicitada · {control.intervencion}</p>}
      {control?.cierre_admin && <p className="whitespace-pre-wrap break-words text-sm">Cierre administrativo · {control.cierre_admin}</p>}
      {estado === "entregado" && !pendiente && (rol === "admin" ? (
        <FormularioCaso titulo="Cerrar operación como administrador" etiquetaTexto="Motivo del cierre administrativo"
          confirmar ejecutar={(nota) => ejecutar("cerrar_admin", nota)} />
      ) : <>
        {!miConfirmacion && <Boton variante="secundario" type="button" disabled={confirmar.isPending} onClick={() => {
          if (confirm(rol === "comprador" ? "¿Confirmas que recibiste lo acordado?" : "¿Confirmas que cumpliste con la entrega?")) confirmar.mutate();
        }}>{rol === "comprador" ? "Confirmar que recibí lo acordado" : "Confirmar que cumplí con la entrega"}</Boton>}
        {confirmar.isError && <p role="alert" className="text-sm text-error">{confirmar.error.message}</p>}
        {!control?.intervencion && <FormularioCaso titulo="Solicitar intervención" etiquetaTexto="Motivo de la solicitud"
          ejecutar={(nota) => ejecutar("intervenir", nota)} />}
      </>)}
    </section>
  );
}
