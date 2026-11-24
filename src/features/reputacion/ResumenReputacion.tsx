import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import EstrellasCalificacion from "./EstrellasCalificacion";
import { cargarReputacion } from "./reputacion";

export default function ResumenReputacion({ id, tipo, mostrarVentas = false, mostrarDistribucion = false, estrellas, alFiltrar }: { id: string; tipo: "comprador" | "tienda"; mostrarVentas?: boolean; mostrarDistribucion?: boolean; estrellas?: number | null; alFiltrar?: (estrella: number) => void }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const consulta = useQuery({
    queryKey: [`reputacion-${tipo}`, id, uid],
    enabled: Boolean(id && supabase && (tipo === "tienda" || uid)),
    queryFn: async () => {
      if (tipo === "tienda") return (await cargarReputacion([id]))[0] ?? null;
      const { data, error } = await supabase!.rpc("reputacion_comprador", { p_comprador: id }).maybeSingle<{
        calificacion_promedio: number | null; total_calificaciones: number; conteo_estrellas: number[];
      }>();
      if (error) throw error;
      return data;
    },
  });
  if (!id || !supabase) return null;
  if (consulta.isPending) return <p className="text-sm text-suave">Consultando reputación…</p>;
  if (consulta.isError || !consulta.data) return <p className="text-sm text-suave">Reputación no disponible.</p>;
  const total = Number(consulta.data.total_calificaciones);
  const ventas = "ventas_completadas" in consulta.data ? Number(consulta.data.ventas_completadas) : 0;
  const conteo = consulta.data.conteo_estrellas;
  const promedio = Number(consulta.data.calificacion_promedio);
  return (
    <div className="space-y-1">
    {total > 0 ? <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm sm:justify-start">
      <strong className="text-lg text-pino">{promedio.toLocaleString("es-PE", { maximumFractionDigits: 2 })}</strong>
      <EstrellasCalificacion puntuacion={promedio} />
      <span className="text-suave">{total} {total === 1 ? "calificación" : "calificaciones"}</span>
    </div> : <p className="text-sm text-suave">Sin calificaciones todavía.</p>}
    {mostrarDistribucion && conteo && (
      <ul aria-label="Distribución de reseñas por estrellas" className="max-w-sm space-y-1 py-2 text-sm">
        {[5, 4, 3, 2, 1].map((estrella, indice) => {
          const cantidad = Number(conteo[indice] ?? 0);
          const claseFila = "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 text-left";
          const contenido = <>
              <span aria-label={estrella === 1 ? "1 estrella" : `${estrella} estrellas`}>{estrella} <span aria-hidden="true">★</span></span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-slate-200">
                <span className="block h-full rounded-full bg-amber-500"
                  style={{ width: `${total ? (cantidad / total) * 100 : 0}%` }} />
              </span>
              <span className="min-w-6 text-right tabular-nums text-suave"
                aria-label={cantidad === 1 ? "1 reseña" : `${cantidad} reseñas`}>{cantidad.toLocaleString("es-PE")}</span>
          </>;
          return (
            <li key={estrella}>
              {alFiltrar ? (
                <button type="button" aria-pressed={estrellas === estrella} onClick={() => alFiltrar(estrella)}
                  className={`${claseFila} rounded-md px-2 py-1.5 hover:bg-hoja focus-visible:outline-2 focus-visible:outline-mercado ${estrellas === estrella ? "bg-hoja font-bold" : ""}`}>
                  {contenido}
                </button>
              ) : <div className={claseFila}>{contenido}</div>}
            </li>
          );
        })}
      </ul>
    )}
    {mostrarVentas && <p className="text-sm text-suave">{ventas} {ventas === 1 ? "venta completada" : "ventas completadas"}</p>}
    </div>
  );
}
