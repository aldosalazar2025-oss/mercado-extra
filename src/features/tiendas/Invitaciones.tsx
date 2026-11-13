import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";

type Invitacion = { id: string; store_id: string; store_name: string; role_code: string; role_name: string };

// Invitaciones recibidas para trabajar en una tienda. Aceptar es siempre una decisión de la persona.
export default function Invitaciones() {
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ["mis-invitaciones"],
    queryFn: async (): Promise<Invitacion[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.rpc("mis_invitaciones");
      if (error) throw error;
      return (data ?? []) as Invitacion[];
    },
  });
  const responder = useMutation({
    mutationFn: async (p: { id: string; aceptar: boolean }) => {
      if (!supabase) throw new Error("Sin conexión");
      const { error } = await supabase.rpc("responder_invitacion", { p_id: p.id, p_aceptar: p.aceptar });
      if (error) throw new Error("No se pudo responder la invitación.");
      return p.aceptar;
    },
    onSuccess: (aceptada) => {
      setMensaje(aceptada ? "Listo, ya trabajas en esa tienda. La encuentras en tu panel de vendedor." : "Invitación rechazada.");
      void cliente.invalidateQueries({ queryKey: ["mis-invitaciones"] });
      void cliente.invalidateQueries({ queryKey: ["mis-tiendas"] });
    },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  if (!lista.data?.length && !mensaje) return null;
  return (
    <section className="space-y-3 rounded-xl bg-maiz-suave p-4" aria-live="polite">
      <h2 className="font-display text-lg font-bold">Invitaciones para trabajar en una tienda</h2>
      {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
      <ul className="space-y-2">
        {lista.data?.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3">
            <p><strong>{i.store_name}</strong> te invita como {i.role_name.toLowerCase()}.</p>
            <div className="flex gap-2">
              <Boton variante="secundario" disabled={responder.isPending} onClick={() => responder.mutate({ id: i.id, aceptar: true })}>Aceptar</Boton>
              <Boton variante="contorno" disabled={responder.isPending} onClick={() => responder.mutate({ id: i.id, aceptar: false })}>Rechazar</Boton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
