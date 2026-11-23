import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Pedido } from "@/features/pedidos/tipos";
import { tiposReclamo } from "./casos";
import { CancelarPedido, FormularioCaso } from "./FormularioCaso";
import { ListaCasos } from "./ListaCasos";

export default function CasosPedido({ pedido: p, uid }: { pedido: Pedido; uid: string }) {
  const reclamable = ["enviado_o_listo", "pendiente_confirmacion", "entregado", "completada"].includes(p.estado);
  const cancelable = ["oferta_aceptada", "compra_coordinada", "en_preparacion", "evidencias_registradas"].includes(p.estado);
  const abrir = p.mi_rol === "comprador" && reclamable;
  const activos = useQuery({
    queryKey: ["casos", uid, "abiertos", p.order_id],
    enabled: Boolean(abrir && supabase),
    queryFn: async () => {
      const { count, error } = await supabase!.from("claims").select("id", { count: "exact", head: true })
        .eq("order_id", p.order_id).in("status", ["abierto", "en_revision"]);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  return (
    <>
      {cancelable && <CancelarPedido id={p.order_id} />}
      {abrir && activos.isError && <p role="alert" className="text-error">No se pudo comprobar si hay un reclamo abierto.</p>}
      {abrir && activos.data === false && <FormularioCaso titulo="Presentar reclamo" etiquetaTexto="Describe lo ocurrido" minimo={10}
        opciones={tiposReclamo} ejecutar={async (description, type) => {
          const { error } = await supabase!.from("claims").insert({
            order_id: p.order_id, buyer_id: uid, store_id: p.store_id, type, description,
          });
          if (error) throw new Error(error.message);
        }} />}
      {reclamable && <ListaCasos clase="reclamo" rol={p.mi_rol} pedido={p.order_id} />}
      {p.estado === "cancelada" && <ListaCasos clase="cancelacion" rol={p.mi_rol} pedido={p.order_id} />}
    </>
  );
}
