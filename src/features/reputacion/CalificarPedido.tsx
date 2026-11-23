import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";
import type { Pedido } from "@/features/pedidos/tipos";

export default function CalificarPedido({ p, uid }: { p: Pedido; uid: string }) {
  const cliente = useQueryClient();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const clave = ["calificaciones", uid, p.order_id, p.mi_rol];
  const previa = useQuery({
    queryKey: clave,
    queryFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.from("ratings").select("score,comment")
        .eq("order_id", p.order_id).eq("rater_role", p.mi_rol).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const enviar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { error } = await supabase.rpc("calificar_pedido", {
        p_order: p.order_id, p_rol: p.mi_rol, p_score: score, p_comment: comment,
      });
      if (error?.code === "23505") {
        await cliente.invalidateQueries({ queryKey: clave });
        throw new Error("Ya se registró una calificación para este pedido.");
      }
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ["calificaciones", uid] }),
        cliente.invalidateQueries({ queryKey: ["reputacion-tienda", p.store_id] }),
        cliente.invalidateQueries({ queryKey: ["ofertas-solicitud", p.request_id] }),
      ]);
    },
  });

  return (
    <section className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold text-pino">
        {p.mi_rol === "comprador" ? "Califica a la tienda" : "Califica al comprador"}
      </h3>
      {previa.isPending && <p className="text-sm text-suave">Consultando la calificación…</p>}
      {previa.isError && <p role="alert" className="text-error">No se pudo consultar la calificación.</p>}
      {previa.data && <>
        <p className="font-bold">Calificación enviada · {previa.data.score} de 5</p>
        {previa.data.comment && <p className="whitespace-pre-wrap break-words">{previa.data.comment}</p>}
      </>}
      {previa.isSuccess && !previa.data && (
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          if (score > 0) enviar.mutate();
        }}>
          <fieldset className="space-y-1" disabled={enviar.isPending}>
            <legend className="text-sm font-bold">Puntuación de 1 a 5 estrellas</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((valor) => (
                <label key={valor} className="flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-borde px-2">
                  <input type="radio" name="puntuacion" value={valor} checked={score === valor} onChange={() => setScore(valor)} required />
                  <span>{valor} <span aria-hidden="true">★</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-bold">
            Comentario (opcional)
            <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" value={comment}
              maxLength={1000} rows={3} onChange={(event) => setComment(event.target.value)} disabled={enviar.isPending} />
          </label>
          {enviar.isError && <p role="alert" className="text-sm text-error">{enviar.error.message}</p>}
          <Boton type="submit" disabled={!score || enviar.isPending}>{enviar.isPending ? "Enviando…" : "Enviar calificación"}</Boton>
        </form>
      )}
    </section>
  );
}
