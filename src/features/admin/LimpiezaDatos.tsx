import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

const secciones = {
  negociaciones: "Solicitudes y ofertas",
  pedidos: "Pedidos, entregas y cierres",
  chat: "Conversaciones y mensajes",
  reclamos: "Reclamos, devoluciones y reembolsos",
  cancelaciones: "Cancelaciones",
  sanciones: "Sanciones y apelaciones",
  reputacion: "Calificaciones y denuncias",
  notificaciones: "Notificaciones",
  productos: "Productos e imágenes",
  tiendas: "Tiendas y empleados",
  categorias: "Categorías",
  promociones: "Promociones",
  planes: "Planes y suscripciones",
  identidad: "Verificaciones de identidad",
  cuentas: "Cuentas de usuario",
  equipo: "Invitaciones administrativas",
  auditoria: "Historial de auditoría",
} as const;

type Seccion = keyof typeof secciones;
type Vista = { secciones: Seccion[]; conteos: Partial<Record<Seccion, number>>; archivos: number };
type Archivo = { bucket: string; nombre: string };
const claves = Object.keys(secciones) as Seccion[];
const actividad: Seccion[] = ["negociaciones", "pedidos", "chat", "reclamos", "cancelaciones", "sanciones", "reputacion", "notificaciones"];

async function borrarArchivos(id: string, actualizar: (cantidad: number) => void) {
  if (!supabase) throw new Error("Sin conexión");
  let anterior = "";
  let borrados = 0;
  for (;;) {
    const { data, error } = await supabase.rpc("admin_lote_limpieza", { p_id: id });
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as Archivo[];
    if (!lote.length) break;
    const firma = JSON.stringify(lote);
    if (firma === anterior) throw new Error("Storage no pudo retirar los archivos. Puedes reanudar la limpieza.");
    anterior = firma;
    const grupos = new Map<string, string[]>();
    lote.forEach(({ bucket, nombre }) => grupos.set(bucket, [...(grupos.get(bucket) ?? []), nombre]));
    for (const [bucket, nombres] of grupos) {
      const respuesta = await supabase.storage.from(bucket).remove(nombres);
      if (respuesta.error) throw new Error(respuesta.error.message);
      borrados += respuesta.data?.length ?? 0;
      actualizar(borrados);
    }
  }
  const { error } = await supabase.rpc("admin_finalizar_limpieza", { p_id: id });
  if (error) throw new Error(error.message);
}

export default function LimpiezaDatos() {
  const { perfil, session } = useAuth();
  const cliente = useQueryClient();
  const [marcadas, setMarcadas] = useState<Seccion[]>([]);
  const [vista, setVista] = useState<Vista | null>(null);
  const [frase, setFrase] = useState("");
  const [borrados, setBorrados] = useState(0);
  const pendiente = useQuery({
    queryKey: ["limpieza-admin", session?.user.id],
    enabled: Boolean(perfil?.is_admin && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("admin_limpieza_pendiente");
      if (error) throw new Error(error.message);
      return data as string | null;
    },
  });
  const previo = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc("admin_previsualizar_limpieza", { p_secciones: marcadas });
      if (error) throw new Error(error.message);
      return data as Vista;
    },
    onSuccess: setVista,
  });
  const ejecutar = useMutation({
    mutationFn: async (id?: string) => {
      if (!supabase) throw new Error("Sin conexión");
      if (!id) {
        const { data, error } = await supabase.rpc("admin_ejecutar_limpieza", {
          p_secciones: marcadas, p_vista: vista, p_confirmacion: frase,
        });
        if (error) throw new Error(error.message);
        id = data as string;
        setVista(null);
        setFrase("");
      }
      setBorrados(0);
      await borrarArchivos(id, setBorrados);
    },
    onSettled: async () => {
      await pendiente.refetch();
      await Promise.all(["admin","casos","pedidos","notificaciones","mis-tiendas","mis-solicitudes","mis-ofertas","catalogo"].map((clave) =>
        cliente.invalidateQueries({ queryKey: [clave] })));
    },
  });
  if (!perfil?.is_admin) return null;

  const cambiar = (siguientes: Seccion[]) => {
    setMarcadas(siguientes);
    setVista(null);
    setFrase("");
    previo.reset();
    ejecutar.reset();
  };
  const ocupado = previo.isPending || ejecutar.isPending;
  return (
    <details className="rounded-xl border border-borde bg-white p-4 sm:p-5">
      <summary className="cursor-pointer font-display text-lg font-bold text-error">Vaciar datos de la plataforma</summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-suave">El borrado es permanente. Tu cuenta administradora, su verificación y la estructura de la base de datos se conservan.</p>
        {pendiente.isError && <p role="alert" className="text-error">No se pudo consultar si hay una limpieza pendiente.</p>}
        {pendiente.data ? (
          <div className="space-y-2 rounded-lg bg-maiz-suave p-3">
            <p className="text-sm font-semibold">Hay una limpieza pendiente de terminar.</p>
            <Boton type="button" disabled={ocupado} onClick={() => ejecutar.mutate(pendiente.data!)}>Reanudar limpieza</Boton>
          </div>
        ) : pendiente.isSuccess && <>
          <fieldset disabled={ocupado} className="space-y-3">
            <legend className="mb-2 font-bold text-pino">Secciones que quieres vaciar</legend>
            <div className="flex flex-wrap gap-2">
              <Boton type="button" variante="contorno" onClick={() => cambiar(actividad)}>Solo actividad</Boton>
              <Boton type="button" variante="contorno" onClick={() => cambiar(claves)}>Marcar todas</Boton>
              <Boton type="button" variante="contorno" onClick={() => cambiar([])}>Desmarcar todas</Boton>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {claves.map((clave) => <label key={clave} className="flex items-center gap-2 rounded-lg border border-borde p-2 text-sm">
                <input type="checkbox" checked={marcadas.includes(clave)} onChange={(e) =>
                  cambiar(e.target.checked ? [...marcadas, clave] : marcadas.filter((s) => s !== clave))} />
                {secciones[clave]}
              </label>)}
            </div>
            <Boton type="button" variante="contorno" disabled={!marcadas.length} onClick={() => { setVista(null); previo.mutate(); }}>
              {previo.isPending ? "Calculando…" : "Revisar qué se borrará"}
            </Boton>
          </fieldset>
          {previo.isError && <p role="alert" className="text-error">{previo.error.message}</p>}
          {vista && <form className="space-y-3 rounded-lg border border-error/30 p-4" onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado && frase === "BORRAR DATOS") ejecutar.mutate(undefined);
          }}>
            <h3 className="font-bold text-pino">Vista previa del borrado</h3>
            <ul className="divide-y divide-borde text-sm">
              {vista.secciones.map((clave) => <li key={clave} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{secciones[clave]}{!marcadas.includes(clave) && <span className="text-suave"> · Añadida por dependencia</span>}</span>
                <strong>{(vista.conteos[clave] ?? 0).toLocaleString("es-PE")} registros</strong>
              </li>)}
            </ul>
            <p className="text-sm font-semibold">{vista.archivos.toLocaleString("es-PE")} archivos en Storage</p>
            <label className="block text-sm font-bold">Escribe BORRAR DATOS para confirmar
              <input className="mt-1 block w-full max-w-sm rounded-lg border border-borde p-2 font-normal" autoComplete="off"
                value={frase} disabled={ocupado} onChange={(e) => setFrase(e.target.value)} />
            </label>
            <Boton type="submit" disabled={ocupado || frase !== "BORRAR DATOS"}>Borrar definitivamente</Boton>
          </form>}
        </>}
        {ejecutar.isPending && <p role="status" className="text-sm">Limpieza en curso. Archivos retirados en este intento: {borrados}.</p>}
        {ejecutar.isError && <p role="alert" className="text-error">{ejecutar.error.message}</p>}
        {ejecutar.isSuccess && <p role="status" className="font-semibold text-pino">Limpieza completada.</p>}
      </div>
    </details>
  );
}
