import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUid } from "@/features/reclamos/casos";
import { supabase } from "@/lib/supabase";

export function useHistorialPersonal(seccion: string, habilitado = true) {
  const uid = useUid();
  const cliente = useQueryClient();
  const [marcados, setMarcados] = useState<string[]>([]);
  const clave = ["historial-personal", uid, seccion];
  const consulta = useQuery({
    queryKey: clave,
    enabled: Boolean(habilitado && uid && supabase),
    retry: false,
    queryFn: async () => {
      const ids = new Set<string>();
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase!.from("comprador_ocultos").select("registro")
          .eq("usuario", uid).eq("seccion", seccion).order("registro").range(inicio, inicio + 499);
        if (error) throw error;
        data.forEach(({ registro }) => ids.add(registro));
        if (data.length < 500) return ids;
      }
    },
  });
  const cambio = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 1000) {
        const lote = ids.slice(i, i + 1000);
        const { data, error } = await supabase!.rpc("ocultar_historial_comprador", { p_seccion: seccion, p_ids: lote });
        if (error) throw error;
        if (Number(data) < lote.length) throw new Error("Algún registro ya no está disponible para quitar.");
      }
    },
    onSettled: async () => { setMarcados([]); await cliente.invalidateQueries({ queryKey: ["historial-personal", uid] }); },
  });
  return {
    visible: (id: string) => !habilitado || !consulta.data?.has(id),
    listo: habilitado && consulta.isSuccess,
    marcados, setMarcados, cambio,
    quitar: (ids: string[]) => {
      const pregunta = ids.length === 1 ? "¿Quitar este registro de tu panel?" : `¿Quitar los ${ids.length} registros seleccionados de tu panel?`;
      const aviso = seccion === "compras" || seccion === "pedidos_tienda"
        ? " Si el pedido está completado, también se ocultarán la solicitud, las ofertas y el chat vinculados de tu vista." : "";
      if (ids.length && confirm(pregunta + aviso)) cambio.mutate(ids);
    },
  };
}

type Historial = ReturnType<typeof useHistorialPersonal>;

function Tacho({ etiqueta, ejecutar, disabled }: { etiqueta: string; ejecutar: () => void; disabled: boolean }) {
  return <button type="button" aria-label={etiqueta} title={etiqueta} onClick={ejecutar} disabled={disabled}
    className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-error hover:bg-red-50 disabled:opacity-40">
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 4v6m4-6v6" />
    </svg>
  </button>;
}

export function SeleccionHistorial({ historial, ids }: { historial: Historial; ids: string[] }) {
  const seleccionados = historial.marcados.filter((id) => ids.includes(id));
  return <>
    {historial.listo && ids.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-white px-3 py-1">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={seleccionados.length === ids.length} disabled={historial.cambio.isPending}
          onChange={(e) => historial.setMarcados(e.target.checked ? ids : [])} />
        Seleccionar todos los visibles
      </label>
      <Tacho etiqueta="Quitar selección de mi panel" ejecutar={() => historial.quitar(seleccionados)}
        disabled={!seleccionados.length || historial.cambio.isPending} />
    </div>}
    {historial.cambio.isError && <p role="alert" className="text-sm text-error">No se pudieron quitar todos los registros seleccionados.</p>}
  </>;
}

export function AccionHistorial({ historial, id }: { historial: Historial; id: string }) {
  if (!historial.listo) return null;
  return <div className="flex items-center gap-1">
    <input type="checkbox" aria-label="Seleccionar registro" checked={historial.marcados.includes(id)} disabled={historial.cambio.isPending}
      onChange={(e) => historial.setMarcados((actuales) => e.target.checked ? [...actuales, id] : actuales.filter((x) => x !== id))} />
    <Tacho etiqueta="Quitar de mi panel" ejecutar={() => historial.quitar([id])} disabled={historial.cambio.isPending} />
  </div>;
}
