import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { FormularioCaso } from "./FormularioCaso";
import { ArchivosCaso } from "./EvidenciasCaso";

type Contexto = {
  solicitud: string; tienda: string; precio: number; oferta: string | null; condiciones: string | null;
  tiempo: string | null; conversacion: string | null; evidencias: string[];
};
type MensajeCaso = { id: string; body: string | null; image_path: string | null; created_at: string };

export default function ContextoPedido({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false);
  const [chat, setChat] = useState<MensajeCaso[] | null>(null);
  const contexto = useQuery({
    queryKey: ["casos", "contexto", id],
    enabled: abierto,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("contexto_pedido_reclamo", { p_order: id }).maybeSingle();
      if (error) throw error;
      return data as Contexto | null;
    },
  });
  const p = contexto.data;
  return (
    <details className="space-y-2 rounded-lg border border-borde p-3" onToggle={(e) => setAbierto(e.currentTarget.open)}>
      <summary className="cursor-pointer font-bold text-mercado">Consultar pedido y oferta</summary>
      {contexto.isLoading && <p className="text-sm text-suave">Cargando pedido…</p>}
      {contexto.isError && <p role="alert" className="text-error">No se pudo consultar el pedido.</p>}
      {contexto.isSuccess && !p && <p className="text-sm text-suave">Datos del pedido no disponibles.</p>}
      {p && <>
        <p className="font-bold">{p.solicitud} · {p.tienda} · {soles(p.precio)}</p>
        {p.oferta && <p className="whitespace-pre-wrap break-words">{p.oferta}</p>}
        {p.condiciones && <p className="text-sm">Condiciones de entrega · {p.condiciones}</p>}
        {p.tiempo && <p className="text-sm">Tiempo estimado · {p.tiempo}</p>}
        <ArchivosCaso rutas={p.evidencias} bucket="delivery-evidence" />
        {p.conversacion && chat === null && <FormularioCaso titulo="Consultar chat" etiquetaTexto="Motivo de la consulta"
          minimo={10} ejecutar={async (texto) => {
            const { data, error } = await supabase!.rpc("admin_leer_chat", { p_conversation: p.conversacion, p_motivo: texto });
            if (error) throw new Error(error.message);
            setChat((data ?? []) as MensajeCaso[]);
          }} />}
        {chat && <ul className="max-h-72 space-y-2 overflow-auto rounded-lg bg-hoja p-3 text-sm">
          {chat.length === 0 && <li>No hay mensajes en la conversación.</li>}
          {chat.map((m) => <li key={m.id}>
            <time className="text-suave">{new Date(m.created_at).toLocaleString("es-PE")}</time>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            {m.image_path && <p className="text-suave">El mensaje incluye una imagen.</p>}
          </li>)}
        </ul>}
      </>}
    </details>
  );
}
