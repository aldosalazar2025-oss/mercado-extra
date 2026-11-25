import { useRef, useState } from "react";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";
import { accion, tiposReclamo, useCasosMutation } from "./casos";
import { formatosEvidencia, VistaPreviaEvidencia } from "./EvidenciasCaso";

export default function PresentarReclamo({ id, uid }: { id: string; uid: string }) {
  const [motivo, setMotivo] = useState<string>(tiposReclamo[0][0]);
  const [descripcion, setDescripcion] = useState("");
  const [archivos, setArchivos] = useState<{ clave: string; archivo: File }[]>([]);
  const [errorArchivo, setErrorArchivo] = useState("");
  const selector = useRef<HTMLInputElement>(null);
  const cargados = useRef(new Map<File, string>());
  const enviar = useCasosMutation(async () => {
    if (!supabase) throw new Error("Sin conexión");
    const rutas = [];
    for (const { archivo } of archivos) {
      let ruta = cargados.current.get(archivo);
      if (!ruta) {
        const extension = formatosEvidencia[archivo.type];
        ruta = `inicio-reclamo/${id}/${uid}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from("claim-evidence").upload(ruta, archivo);
        if (error) throw error;
        cargados.current.set(archivo, ruta);
      }
      rutas.push(ruta);
    }
    await accion("presentar_reclamo_con_evidencia", { p_pedido: id, p_tipo: motivo, p_descripcion: descripcion.trim(), p_archivos: rutas });
  });
  function agregar(seleccion: File[]) {
    const validos = seleccion.filter((archivo) => formatosEvidencia[archivo.type] && archivo.size <= 50 * 1024 * 1024);
    const espacio = 5 - archivos.length;
    const nuevos = validos.slice(0, espacio).map((archivo) => ({ clave: crypto.randomUUID(), archivo }));
    setArchivos([...archivos, ...nuevos]);
    setErrorArchivo(validos.length !== seleccion.length
      ? "Los archivos incompatibles o mayores de 50 MB no se añadieron."
      : validos.length > espacio ? "Solo puedes añadir hasta cinco archivos." : "");
  }
  const archivosValidos = archivos.length > 0;
  return (
    <details className="rounded-xl border border-borde bg-white p-4">
      <summary className="cursor-pointer font-bold text-mercado">Presentar reclamo</summary>
      <form className="mt-3 space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (descripcion.trim().length >= 10 && archivosValidos && !enviar.isPending) enviar.mutate();
      }}>
        <fieldset className="space-y-3" disabled={enviar.isPending || enviar.isSuccess}>
          <label className="block text-sm font-bold">Motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-borde p-2">
              {tiposReclamo.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold">Describe lo ocurrido
            <textarea required minLength={10} maxLength={3000} rows={3} value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)} className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-bold">Evidencias</p>
            <input ref={selector} type="file" multiple hidden accept={Object.keys(formatosEvidencia).join(",")}
              onChange={(e) => {
                agregar(Array.from(e.currentTarget.files ?? []));
                e.currentTarget.value = "";
              }} />
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] items-start gap-3" aria-label="Archivos adjuntos">
              {archivos.map(({ clave, archivo }) => <VistaPreviaEvidencia key={clave} archivo={archivo} eliminar={() => {
                setArchivos(archivos.filter((actual) => actual.clave !== clave));
                setErrorArchivo("");
              }} />)}
              {archivos.length < 5 && <li>
                <Boton type="button" variante="contorno" onClick={() => selector.current?.click()}>+ Añadir archivos</Boton>
              </li>}
            </ul>
            <p className="text-sm text-suave" aria-live="polite">{archivos.length} de 5 archivos adjuntos</p>
            <p className="text-sm text-suave">Fotografías, videos MP4 o PDF de hasta 50 MB cada uno.</p>
            {errorArchivo && <p role="alert" className="text-sm text-error">{errorArchivo}</p>}
          </div>
          <Boton type="submit" disabled={descripcion.trim().length < 10 || !archivosValidos}>{enviar.isPending ? "Enviando…" : "Enviar reclamo"}</Boton>
        </fieldset>
        {enviar.isError && <p role="alert" className="text-sm text-error">{enviar.error.message}</p>}
      </form>
    </details>
  );
}
