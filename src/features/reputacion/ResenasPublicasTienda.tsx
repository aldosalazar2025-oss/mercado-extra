import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";
import EstrellasCalificacion from "./EstrellasCalificacion";

type Resena = { score: number; comment: string | null; fecha: string; autor?: string; foto_url?: string | null };

function AutorResena({ autor, foto }: { autor: string; foto?: string | null }) {
  const [fotoConError, setFotoConError] = useState<string>();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-hoja font-bold text-pino">
        {autor.charAt(0).toUpperCase()}
        {foto && foto !== fotoConError && <img src={foto} alt="" loading="lazy" referrerPolicy="no-referrer"
          onError={() => setFotoConError(foto)} className="absolute inset-0 size-full object-cover" />}
      </span>
      <span className="break-words font-semibold text-pino">{autor}</span>
    </div>
  );
}

export default function ResenasPublicasTienda({ id, estrellas, limpiar }: { id: string; estrellas: number | null; limpiar: () => void }) {
  const filtradas = useInfiniteQuery({
    queryKey: ["resenas-publicas-tienda", id, estrellas],
    enabled: Boolean(id && supabase && estrellas !== null),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase!.rpc("resenas_publicas_por_estrellas", {
        p_tienda: id, p_estrellas: estrellas, p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as Resena[];
    },
    getNextPageParam: (pagina, _, offset) => pagina.length > 20 ? offset + 20 : undefined,
  });
  if (estrellas === null) return <p className="border-t border-borde pt-4 text-sm text-suave">Selecciona una barra para leer las reseñas.</p>;
  const filas = filtradas.data?.pages.flatMap((pagina) => pagina.slice(0, 20)) ?? [];
  const titulo = estrellas === 1 ? "Reseñas de 1 estrella" : `Reseñas de ${estrellas} estrellas`;

  return (
    <div className="space-y-3 border-t border-borde pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-pino" aria-live="polite">{titulo}</h3>
        <Boton type="button" variante="contorno" onClick={limpiar}>Quitar filtro</Boton>
      </div>
      {filtradas.isPending && <p className="text-sm text-suave">Cargando comentarios…</p>}
      {filtradas.isError && filas.length === 0 && <p className="text-sm text-suave">Los comentarios no están disponibles en este momento.</p>}
      {filas.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filas.map((resena, indice) => (
            <li key={indice} className="min-w-0 space-y-2 rounded-xl border border-borde bg-hoja/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AutorResena autor={resena.autor || "Comprador"} foto={resena.foto_url} />
                <time dateTime={resena.fecha} className="text-xs text-suave">
                  {new Date(resena.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                </time>
              </div>
              <EstrellasCalificacion puntuacion={resena.score} />
              <p className="whitespace-pre-wrap break-words text-sm">{resena.comment || "Sin comentario."}</p>
            </li>
          ))}
        </ul>
      ) : filtradas.isSuccess && <p className="text-sm text-suave">
        Todavía no hay reseñas con esta puntuación.
      </p>}
      {filtradas.isFetchNextPageError && <p role="alert" className="text-sm text-error">No se pudieron cargar más reseñas.</p>}
      {filtradas.hasNextPage && (
        <Boton type="button" variante="contorno" disabled={filtradas.isFetchingNextPage} onClick={() => void filtradas.fetchNextPage()}>
          {filtradas.isFetchingNextPage ? "Cargando…" : "Ver más reseñas"}
        </Boton>
      )}
    </div>
  );
}
