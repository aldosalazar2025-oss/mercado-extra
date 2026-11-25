import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Pedido } from "@/features/pedidos/tipos";
import PresentarReclamo from "./PresentarReclamo";
import { CancelarPedido } from "./FormularioCaso";
import { ListaCasos } from "./ListaCasos";

export default function CasosPedido({ pedido: p, uid, tieneReclamo = false }: { pedido: Pedido; uid: string; tieneReclamo?: boolean }) {
  const reclamable = ["enviado_o_listo", "pendiente_confirmacion", "entregado"].includes(p.estado);
  const cancelable = ["oferta_aceptada", "compra_coordinada", "en_preparacion", "evidencias_registradas"].includes(p.estado);
  const abrir = p.mi_rol === "comprador" && reclamable && !tieneReclamo;
  const habilitado = useQuery({
    queryKey: ["casos", uid, "puede-iniciar", p.order_id],
    enabled: Boolean(abrir && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("puede_iniciar_reclamo", { p_pedido: p.order_id });
      if (error) throw error;
      return data === true;
    },
  });
  return (
    <>
      {cancelable && <CancelarPedido id={p.order_id} />}
      {abrir && habilitado.isError && <p role="alert" className="text-error">No se pudo comprobar si puedes presentar un reclamo.</p>}
      {abrir && habilitado.data === true && <PresentarReclamo id={p.order_id} uid={uid} />}
      {(tieneReclamo || reclamable || p.estado === "completada") && <ListaCasos clase="reclamo" rol={p.mi_rol} pedido={p.order_id} />}
      {p.estado === "cancelada" && <ListaCasos clase="cancelacion" rol={p.mi_rol} pedido={p.order_id} />}
    </>
  );
}
