import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUid } from "./casos";

type Aviso = {
  id: string;
  tipo: "advertencia" | "suspension_temporal" | "bloqueo";
  vence: string | null;
  tienda: string | null;
};

const titulos = {
  advertencia: "Advertencia activa",
  suspension_temporal: "Suspensión activa",
  bloqueo: "Bloqueo activo",
};

export default function AvisosSanciones({ destino = "todos" }: { destino?: "usuario" | "tienda" | "todos" }) {
  const uid = useUid();
  const avisos = useQuery({
    queryKey: ["casos", uid, "avisos-sanciones"],
    enabled: Boolean(uid && supabase),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("avisos_sanciones_vigentes");
      if (error) throw error;
      return (data ?? []) as Aviso[];
    },
  });
  const visibles = avisos.data?.filter(({ tienda }) =>
    destino === "todos" || (destino === "tienda" ? tienda !== null : tienda === null),
  );
  if (!visibles?.length) return null;

  return (
    <section className="space-y-2" aria-label="Sanciones vigentes" aria-live="polite">
      {visibles.map(({ id, tipo, vence, tienda }) => (
        <div key={id} className={`rounded-lg border p-3 text-sm ${tipo === "advertencia"
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-red-300 bg-red-50 text-red-950"}`}>
          <p className="font-bold">{titulos[tipo]} · {tienda || "Tu cuenta"}</p>
          <p>{tipo === "advertencia"
            ? "Puedes seguir operando."
            : tienda ? "Las operaciones de esta tienda están restringidas." : "Las operaciones de tu cuenta están restringidas."}
            {vence && ` Hasta el ${new Date(vence).toLocaleString("es-PE")}`}
          </p>
        </div>
      ))}
    </section>
  );
}
