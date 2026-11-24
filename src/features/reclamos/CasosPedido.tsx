import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Pedido } from "@/features/pedidos/tipos";
import { tiposReclamo } from "./casos";
import { CancelarPedido, FormularioCaso } from "./FormularioCaso";
import { ListaCasos } from "./ListaCasos";

export default function CasosPedido({ pedido: p, uid }: { pedido: Pedido; uid: string }) {
  const reclamable = ["enviado_o_listo", "pendiente_confirmacion", "entregado"].includes(p.estado);
  const cancelable = ["oferta_aceptada", "compra_coordinada", "en_preparacion", "evidencias_registradas"].includes(p.estado);
  const abrir = p.mi_rol === "comprador" && reclamable;
  const presentado = useQuery({
    queryKey: ["casos", uid, "presentado", p.order_id],
    enabled: Boolean(abrir && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("pedido_tiene_reclamo", { p_pedido: p.order_id });
      if (error) throw error;
      return data === true;
    },
  });
  return (
    <>
      {cancelable && <CancelarPedido id={p.order_id} />}
      {abrir && presentado.isError && <p role="alert" className="text-error">No se pudo comprobar si ya presentaste un reclamo.</p>}
      {abrir && presentado.data === false && <FormularioCaso titulo="Presentar reclamo" etiquetaTexto="Describe lo ocurrido" minimo={10}
        opciones={tiposReclamo} ejecutar={async (description, type) => {
          const { error } = await supabase!.from("claims").insert({
            order_id: p.order_id, buyer_id: uid, store_id: p.store_id, type, description,
          });
          if (error?.code === "23505") {
            await presentado.refetch();
            return;
          }
          if (error) throw new Error(error.message);
          await presentado.refetch();
        }} />}
      {(reclamable || p.estado === "completada") && <ListaCasos clase="reclamo" rol={p.mi_rol} pedido={p.order_id} />}
      {p.estado === "cancelada" && <ListaCasos clase="cancelacion" rol={p.mi_rol} pedido={p.order_id} />}
    </>
  );
}
