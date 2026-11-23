import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import Boton from "@/components/Boton";
import Burbuja from "@/features/chat/Burbuja";
import { ArchivosCaso } from "./EvidenciasCaso";

type Contexto = {
  solicitud: string; tienda: string; precio: number; oferta: string | null; condiciones: string | null;
  tiempo: string | null; conversacion: string | null; evidencias: string[];
};
type MensajeCaso = { id: string; sender_id: string; body: string | null; image_path: string | null; created_at: string };

type ChatProps = { conversacion: string; compradorId?: string; comprador?: string; tienda: string };

function ChatNegociacion({ conversacion, compradorId, comprador, tienda }: ChatProps) {
  const [motivo, setMotivo] = useState("");
  const consulta = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.rpc("admin_leer_chat", {
        p_conversation: conversacion, p_motivo: motivo.trim(),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as MensajeCaso[];
    },
  });
  return (
    <details className="space-y-3 rounded-lg border border-borde bg-white p-3">
      <summary className="cursor-pointer font-bold text-mercado">Consultar chat de la negociación</summary>
      {consulta.isSuccess ? (
        <section className="space-y-2" aria-label="Mensajes de la negociación">
          <h4 className="font-bold text-pino">Mensajes de la negociación</h4>
          {consulta.data.length === 0 ? <p className="text-sm text-suave">La conversación de este pedido aún no tiene mensajes.</p> : (
            <ol className="max-h-80 space-y-2 overflow-auto rounded-lg bg-hoja p-3 text-sm">
              {consulta.data.map((m) => {
                const delComprador = m.sender_id === compradorId;
                const autor = compradorId
                  ? delComprador ? `Comprador${comprador ? ` · ${comprador}` : ""}` : `Tienda · ${tienda}`
                  : "Mensaje de la negociación";
                return <Burbuja key={m.id} m={m} mio={delComprador} autor={autor} auditoria />;
              })}
            </ol>
          )}
        </section>
      ) : (
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (motivo.trim().length >= 10 && !consulta.isPending) consulta.mutate();
        }}>
          <p className="text-sm text-suave">Escribe al menos 10 caracteres para ver los mensajes del pedido. La consulta queda registrada en auditoría.</p>
          <label className="block text-sm font-bold">Motivo de la consulta
            <textarea required rows={2} maxLength={3000} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" />
          </label>
          <Boton type="submit" disabled={motivo.trim().length < 10 || consulta.isPending}>
            {consulta.isPending ? "Cargando chat…" : "Ver mensajes"}
          </Boton>
          {consulta.isError && <p role="alert" className="text-sm text-error">No se pudo abrir el chat. {consulta.error.message}</p>}
        </form>
      )}
    </details>
  );
}

export default function ContextoPedido({ id, compradorId, comprador }: { id: string; compradorId?: string; comprador?: string }) {
  const [abierto, setAbierto] = useState(false);
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
        <dl className="grid gap-3 rounded-lg bg-hoja/40 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold text-pino">Solicitud del comprador</dt>
            <dd className="break-words">{p.solicitud}</dd>
          </div>
          <div>
            <dt className="font-bold text-pino">Tienda que hizo la oferta</dt>
            <dd className="break-words">{p.tienda}</dd>
          </div>
          <div>
            <dt className="font-bold text-pino">Precio acordado del pedido</dt>
            <dd>{soles(p.precio)}</dd>
          </div>
          {p.oferta && <div className="sm:col-span-2">
            <dt className="font-bold text-pino">Descripción de la oferta de la tienda</dt>
            <dd className="whitespace-pre-wrap break-words">{p.oferta}</dd>
          </div>}
          {p.condiciones && <div>
            <dt className="font-bold text-pino">Condiciones de entrega ofrecidas</dt>
            <dd className="whitespace-pre-wrap break-words">{p.condiciones}</dd>
          </div>}
          {p.tiempo && <div>
            <dt className="font-bold text-pino">Tiempo de entrega ofrecido</dt>
            <dd className="whitespace-pre-wrap break-words">{p.tiempo}</dd>
          </div>}
        </dl>
        <ArchivosCaso rutas={p.evidencias} bucket="delivery-evidence" />
        {p.conversacion
          ? <ChatNegociacion key={p.conversacion} conversacion={p.conversacion} compradorId={compradorId} comprador={comprador} tienda={p.tienda} />
          : <p className="text-sm text-suave">Este pedido no tiene un chat asociado.</p>}
      </>}
    </details>
  );
}
