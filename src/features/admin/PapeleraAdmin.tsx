import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";
import { accion, useCasosMutation, useUid } from "@/features/reclamos/casos";

const secciones: Record<string, string> = {
  requests: "Solicitudes", offers: "Ofertas", orders: "Operaciones", claims: "Reclamos",
  cancellations: "Cancelaciones", sanctions: "Sanciones", rating_reports: "Reputación",
  promotions: "Promociones", subscriptions: "Solicitudes de planes", subscription_plans: "Catálogo de planes", categories: "Categorías",
};

type Archivado = { tabla: string; id: string; titulo: string; archivado_en: string; conservar: boolean };
type AccionPapelera = "eliminar" | "archivar";

export function useAccionesPapelera(tabla: string, ids: string[]) {
  const uid = useUid();
  return useQuery({
    queryKey: ["admin", uid, "acciones-papelera", tabla, ids],
    enabled: Boolean(uid && supabase && ids.length),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("admin_acciones_papelera", { p_tabla: tabla, p_ids: ids });
      if (error) throw error;
      return new Map((data as { id: string; accion: AccionPapelera }[]).map(({ id, accion }) => [id, accion]));
    },
  }).data;
}

export function EliminarRegistros({ tabla, ids, plan, alEliminar, modo = "eliminar" }: {
  tabla: string; ids: string[]; plan?: string; alEliminar?: () => void; modo?: AccionPapelera;
}) {
  const cliente = useQueryClient();
  const archivar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = modo === "archivar"
        ? tabla === "cancellations"
          ? await supabase.rpc("admin_archivar_cancelaciones", { p_ids: ids })
          : await supabase.rpc("admin_archivar_ventas", { p_tabla: tabla, p_ids: ids })
        : await supabase.rpc("admin_enviar_papelera", { p_tabla: tabla, p_ids: ids });
      if (error) throw new Error(error.message);
      return Number(data);
    },
    onSuccess: async () => {
      alEliminar?.();
      await Promise.all(["admin", "casos", "monetizacion", "admin-categorias"].map((clave) => cliente.invalidateQueries({ queryKey: [clave] })));
    },
  });

  const etiqueta = modo === "archivar" ? (alEliminar ? "Archivar selección" : "Archivar registro")
    : plan ? "Eliminar plan" : alEliminar ? "Eliminar selección" : "Eliminar registro";
  return (
    <div>
      <button type="button" aria-label={etiqueta} title={etiqueta} disabled={!ids.length || archivar.isPending}
        className={`inline-flex size-10 items-center justify-center rounded-lg focus-visible:outline-2 disabled:opacity-40 ${modo === "archivar" ? "text-mercado hover:bg-hoja" : "text-error hover:bg-red-50"}`}
        onClick={() => {
        const seleccion = plan ? `el plan «${plan}»` : alEliminar ? `los ${ids.length} registros seleccionados` : "este registro";
        const mensaje = modo === "archivar" ? `¿Archivar ${seleccion} conservando el historial? Puedes recuperarlo desde Auditoría.`
          : `¿Enviar a la papelera ${seleccion}? Puedes recuperarlos desde Auditoría durante 15 días.`;
        if (confirm(mensaje)) archivar.mutate();
      }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 4v6m4-6v6" />
        </svg>
      </button>
      {archivar.isSuccess && <p role="status" className="text-sm text-pino">
        {archivar.data === 0 ? plan ? "El plan debe estar desactivado y sin suscripciones asociadas."
          : tabla === "categories" ? "La categoría debe estar desactivada y sin registros vinculados."
          : "Los registros mostrados no se pueden eliminar en su estado actual." : `Enviados a Auditoría → Papelera: ${archivar.data}.`}
      </p>}
      {archivar.isError && <p role="alert" className="text-sm text-error">{archivar.error.message}</p>}
    </div>
  );
}

export function useSeleccionPapelera(clave: string, visibles: string[]) {
  const [seleccion, setSeleccion] = useState({ clave, ids: [] as string[] });
  const ids = seleccion.clave === clave ? seleccion.ids.filter((id) => visibles.includes(id)) : [];
  const guardar = (marcados: string[]) => setSeleccion({ clave, ids: marcados });
  return {
    ids, visibles, guardar,
    marcar: (id: string, marcada: boolean) => guardar(marcada ? [...ids, id] : ids.filter((actual) => actual !== id)),
  };
}

export function SeleccionPapelera({ tabla, seleccion, acciones }: {
  tabla: string; seleccion: ReturnType<typeof useSeleccionPapelera>; acciones?: Map<string, AccionPapelera>;
}) {
  const { ids, visibles, guardar } = seleccion;
  if (!visibles.length) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borde bg-white px-3 py-1">
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={ids.length === visibles.length} onChange={(e) => guardar(e.target.checked ? visibles : [])} />
      Seleccionar todos los archivables o eliminables
    </label>
    <span className="ml-auto text-sm text-suave" aria-live="polite">{ids.length} {ids.length === 1 ? "seleccionado" : "seleccionados"}</span>
    {(["archivar", "eliminar"] as const).map((modo) => {
      const permitidos = ids.filter((id) => acciones?.get(id) === modo);
      return permitidos.length > 0 && <EliminarRegistros key={modo} tabla={tabla} ids={permitidos} modo={modo}
        alEliminar={() => guardar(ids.filter((id) => !permitidos.includes(id)))} />;
    })}
  </div>;
}

export function TachoParaResolver({ destino, etiqueta }: { destino: string; etiqueta: string }) {
  return <button type="button" aria-label={etiqueta} title={etiqueta}
    className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-mercado hover:bg-hoja"
    onClick={() => {
      const destinoCaso = document.getElementById(destino);
      if (destinoCaso instanceof HTMLDetailsElement) destinoCaso.open = true;
      destinoCaso?.scrollIntoView({ block: "center" });
      destinoCaso?.focus({ preventScroll: true });
    }}>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 4v6m4-6v6" />
    </svg>
  </button>;
}

export function AccionesTarjeta({ tabla, id, seleccion, accion }: {
  tabla: string; id: string; seleccion?: ReturnType<typeof useSeleccionPapelera>; accion?: AccionPapelera;
}) {
  return <div className="flex items-start gap-1">
    {seleccion?.visibles.includes(id) && <label className="flex size-10 items-center justify-center">
      <input type="checkbox" aria-label="Seleccionar registro" checked={seleccion.ids.includes(id)}
        onChange={(e) => seleccion.marcar(id, e.target.checked)} />
    </label>}
    {accion && <EliminarRegistros tabla={tabla} ids={[id]} modo={accion} />}
  </div>;
}

function FichaArchivada({ registro }: { registro: Archivado }) {
  const cliente = useQueryClient();
  const recuperar = useCasosMutation(async () => {
    await accion("admin_recuperar_archivado", { p_tabla: registro.tabla, p_id: registro.id });
    if (registro.tabla === "categories") await cliente.invalidateQueries({ queryKey: ["admin-categorias"] });
  });
  const fecha = new Date(Date.parse(registro.archivado_en) + 15 * 24 * 60 * 60 * 1000);
  return <li className="space-y-2 rounded-lg border border-borde bg-white p-3">
    <p className="text-sm font-bold text-mercado">{secciones[registro.tabla] ?? registro.tabla}</p>
    <p className="break-words">{registro.titulo}</p>
    <p className="text-sm text-suave">{registro.conservar ? "Historial conservado · Sin purga automática" : `Purga a partir del ${fecha.toLocaleString("es-PE")}`}</p>
    <Boton variante="contorno" disabled={recuperar.isPending} onClick={() => recuperar.mutate()}>
      {recuperar.isPending ? "Recuperando…" : "Recuperar"}
    </Boton>
    {recuperar.isError && <p role="alert" className="text-sm text-error">{recuperar.error.message}</p>}
  </li>;
}

export function PapeleraAuditoria() {
  const uid = useUid();
  const [tabla, setTabla] = useState("");
  const [pagina, setPagina] = useState(0);
  const consulta = useQuery({
    queryKey: ["admin", uid, "papelera", tabla, pagina],
    queryFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.rpc("admin_listar_papelera", { p_tabla: tabla || null, p_offset: pagina * 25 });
      if (error) throw error;
      return data as Archivado[];
    },
  });
  return <section className="space-y-3">
    <p className="text-sm text-suave">Recupera aquí los registros eliminados antes de los 15 días. Los expedientes con historial conservado siguen disponibles después de ese plazo.</p>
    <label className="block max-w-xs text-sm font-bold">Sección
      <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3"
        value={tabla} onChange={(e) => { setTabla(e.target.value); setPagina(0); }}>
        <option value="">Todas las secciones</option>
        {Object.entries(secciones).map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}
      </select>
    </label>
    {consulta.isPending && <p>Cargando papelera…</p>}
    {consulta.isError && <p role="alert" className="text-error">No se pudo cargar la papelera.</p>}
    {consulta.data?.length === 0 && <p className="text-suave">No hay registros eliminados en esta sección.</p>}
    <ul className="grid gap-3 lg:grid-cols-2">
      {consulta.data?.slice(0, 25).map((registro) => <FichaArchivada key={registro.tabla + registro.id} registro={registro} />)}
    </ul>
    {(pagina > 0 || (consulta.data?.length ?? 0) > 25) && <nav aria-label="Páginas de papelera" className="flex flex-wrap gap-2">
      <Boton variante="contorno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
      <Boton variante="contorno" disabled={(consulta.data?.length ?? 0) <= 25} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
    </nav>}
  </section>;
}
