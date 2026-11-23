import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

function Denunciar({ id, uid }: { id: string; uid: string }) {
  const cliente = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const enviar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { error } = await supabase.from("rating_reports").insert({
        rating_id: id, reporter_id: uid, reason: motivo.trim(),
      });
      if (error && error.code !== "23505") throw new Error("No se pudo enviar la denuncia. Inténtalo de nuevo.");
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["calificaciones", uid, "historial"] }),
  });

  if (enviar.isSuccess) return <p role="status" className="text-sm text-suave">Denuncia registrada.</p>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-bold text-mercado">Denunciar calificación</summary>
      <form className="mt-2 space-y-2" onSubmit={(event) => {
        event.preventDefault();
        if (motivo.trim().length >= 5) enviar.mutate();
      }}>
        <label className="block font-bold">
          Motivo
          <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" value={motivo}
            rows={3} minLength={5} maxLength={1000} required disabled={enviar.isPending}
            onChange={(event) => setMotivo(event.target.value)} />
        </label>
        {enviar.isError && <p role="alert" className="text-error">{enviar.error.message}</p>}
        <Boton type="submit" variante="contorno" disabled={motivo.trim().length < 5 || enviar.isPending}>
          {enviar.isPending ? "Enviando…" : "Enviar denuncia"}
        </Boton>
      </form>
    </details>
  );
}

export default function MisCalificaciones({ rol }: { rol: "comprador" | "vendedor" }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const consulta = useQuery({
    queryKey: ["calificaciones", uid, "historial", rol],
    enabled: Boolean(uid && supabase),
    queryFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.from("ratings")
        .select("id,rater_id,rated_id,rater_role,score,comment,status,created_at,rating_reports(id,status)")
        .or(`rater_id.eq.${uid},rated_id.eq.${uid}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((fila) =>
        (fila.rater_id === uid && fila.rater_role === rol) || (fila.rated_id === uid && fila.rater_role !== rol),
      );
    },
  });
  if (!supabase) return <p className="text-suave">Conecta Supabase para consultar tus calificaciones.</p>;
  if (consulta.isPending) return <p className="text-suave">Cargando calificaciones…</p>;
  if (consulta.isError) return <p role="alert" className="text-error">No se pudieron cargar las calificaciones.</p>;
  if (consulta.data.length === 0) return <p className="rounded-xl bg-white p-6 text-suave">Aún no tienes calificaciones enviadas ni recibidas.</p>;
  return (
    <ul className="space-y-3">
      {consulta.data.map((fila) => {
        const recibida = fila.rated_id === uid;
        const denuncia = fila.rating_reports[0];
        return (
          <li key={fila.id} className="space-y-2 rounded-xl border border-borde bg-white p-4">
            <p className="font-bold text-pino">{fila.score} de 5 · {recibida ? "Recibida" : "Enviada"}</p>
            <p className="text-sm text-suave">{new Date(fila.created_at).toLocaleDateString("es-PE")}{fila.status === "oculta" && " · Oculta"}</p>
            {fila.comment && <p className="whitespace-pre-wrap break-words">{fila.comment}</p>}
            {recibida && (denuncia
              ? <p className="text-sm text-suave">Denuncia {denuncia.status}</p>
              : fila.status !== "oculta" && <Denunciar id={fila.id} uid={uid} />)}
          </li>
        );
      })}
    </ul>
  );
}
