import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";
import { accion, useCasosMutation } from "./casos";

const bucketCasos = "claim-evidence";
export const formatosEvidencia: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "application/pdf": "pdf",
};

export function useArchivosCaso(rutas: string[], bucket = bucketCasos) {
  return useQuery({
    queryKey: ["casos", "archivos", bucket, rutas],
    enabled: Boolean(supabase && rutas.length),
    staleTime: 4 * 60 * 1000,
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(rutas, 300);
      if (error) throw error;
      return data;
    },
  });
}

export function ArchivosCaso({ rutas, bucket = bucketCasos, titulo = "Evidencias", miniaturas = false, datosPorRuta }: { rutas: string[]; bucket?: string; titulo?: string; miniaturas?: boolean; datosPorRuta?: Record<string, { etapa: string; remitente: string }> }) {
  const consulta = useArchivosCaso(rutas, bucket);
  if (!rutas.length) return null;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-bold">{titulo}</p>
      {consulta.isPending && <p>Cargando archivos…</p>}
      {consulta.isError && <p role="alert">No se pudieron abrir los archivos.</p>}
      <ul className={miniaturas ? "flex flex-wrap gap-3" : "space-y-1"}>{consulta.data?.map((archivo, i) => {
        const ruta = archivo.path ?? rutas[i];
        const extension = ruta.split(".").pop()?.toLowerCase();
        const datos = datosPorRuta?.[ruta];
        const etiqueta = datos ? `Ver evidencia de ${datos.etapa.toLowerCase()}` : `Ver evidencia ${i + 1}`;
        const url = archivo.signedUrl;
        return <li key={ruta} className={miniaturas ? "w-44 max-w-full space-y-2 rounded-lg border border-borde p-2" : undefined}>
          {datos && <div className="space-y-1">
            <p className="font-bold text-pino">{datos.etapa}</p>
            <p className="break-words text-xs text-suave">Enviada por {datos.remitente}</p>
          </div>}
          {url && miniaturas && extension === "mp4" && <video src={url} controls preload="metadata"
            aria-label={`Video de evidencia ${i + 1}`} className="aspect-square w-full rounded-md bg-slate-900 object-contain" />}
          {url ? <a href={url} target="_blank" rel="noreferrer" className="block font-bold text-mercado underline">
            {miniaturas && extension === "pdf" && <span aria-hidden="true"
              className="mb-2 flex aspect-square items-center justify-center rounded-md bg-hoja text-pino">PDF</span>}
            {miniaturas && ["jpg", "jpeg", "png", "webp"].includes(extension ?? "") && <img
              src={url} alt="" loading="lazy" className="mb-2 aspect-square w-full rounded-md object-contain bg-hoja/40" />}
            {etiqueta}
          </a> : "Archivo no disponible"}
        </li>;
      })}</ul>
    </div>
  );
}

export function VistaPreviaEvidencia({ archivo, eliminar, deshabilitada }: { archivo: File; eliminar: () => void; deshabilitada?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (archivo.type === "application/pdf") return;
    const vista = URL.createObjectURL(archivo);
    setUrl(vista);
    return () => URL.revokeObjectURL(vista);
  }, [archivo]);

  return <li className="min-w-0 space-y-2 rounded-lg border border-borde bg-white p-2">
    {archivo.type === "application/pdf" ? (
      <span className="flex aspect-square items-center justify-center rounded-md bg-hoja font-bold text-pino">PDF</span>
    ) : url && (archivo.type === "video/mp4" ? (
      <video src={url} controls preload="metadata" aria-label={archivo.name} className="aspect-square w-full rounded-md bg-slate-900 object-contain" />
    ) : <img src={url} alt={archivo.name} className="aspect-square w-full rounded-md object-cover" />)}
    <p className="break-words text-xs text-suave">{archivo.name}</p>
    <Boton type="button" variante="contorno" aria-label={`Eliminar ${archivo.name}`} onClick={eliminar} disabled={deshabilitada}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1 inline size-4" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6" />
      </svg>
      Eliminar
    </Boton>
  </li>;
}

export function AdjuntarEvidencia({ id, uid, cancelacion = false, devolucion = false, cumplimiento = false, entregaSinCodigo = false, reembolso = false }: { id: string; uid: string; cancelacion?: boolean; devolucion?: boolean; cumplimiento?: boolean; entregaSinCodigo?: boolean; reembolso?: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [fechaReembolso, setFechaReembolso] = useState("");
  const [metodo, setMetodo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorArchivo, setErrorArchivo] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [rutaCargada, setRutaCargada] = useState<string | null>(null);
  const guardar = useCasosMutation(async (file: File) => {
    if (!supabase) throw new Error("Sin conexión");
    const extension = formatosEvidencia[file.type];
    if (!extension || file.size > 50 * 1024 * 1024) throw new Error("Usa una imagen JPG, PNG o WebP, un video MP4 o un PDF de hasta 50 MB.");
    const carpeta = entregaSinCodigo ? `entregas-sin-codigo/${id}/${uid}` : devolucion || cumplimiento || reembolso ? `devoluciones/${id}/${uid}` : cancelacion ? `cancelaciones/${id}/${uid}` : `${id}/${uid}`;
    const ruta = rutaCargada ?? `${carpeta}/${crypto.randomUUID()}.${extension}`;
    if (!rutaCargada) {
      const { error } = await supabase.storage.from(bucketCasos).upload(ruta, file);
      if (error) throw new Error(error.message);
      setRutaCargada(ruta);
    }
    if (entregaSinCodigo) {
      await accion("gestionar_cierre_pedido", { p_order: id, p_accion: "reportar", p_nota: motivo.trim(), p_evidencia: ruta });
    } else if (reembolso) {
      await accion("registrar_reembolso_reclamo", { p_reclamo: id, p_fecha: fechaReembolso, p_metodo: metodo.trim(), p_comprobante: ruta });
    } else if (devolucion || cumplimiento) {
      await accion("gestionar_devolucion", { p_reclamo: id, p_accion: cumplimiento ? "cumplir" : "enviar", p_evidencia: ruta });
    } else if (cancelacion) {
      await accion("adjuntar_cancelacion", { p_id: id, p_ruta: ruta });
    } else {
      const kind = extension === "pdf" ? "documento" : extension === "mp4" ? "video" : "foto";
      const { error } = await supabase.from("claim_evidence").insert({ claim_id: id, author_id: uid, kind, file_path: ruta });
      if (error) throw new Error(error.message);
    }
    setRutaCargada(null);
    setArchivo(null);
    if (entrada.current) entrada.current.value = "";
  });
  const datosValidos = (!entregaSinCodigo || motivo.trim().length >= 5) && (!reembolso || (fechaReembolso && metodo.trim().length >= 2));
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      if (archivo && datosValidos && !guardar.isPending) guardar.mutate(archivo);
    }}>
      {entregaSinCodigo && <label className="block text-sm font-bold">¿Cómo se entregó el producto?
        <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" value={motivo}
          onChange={(e) => setMotivo(e.target.value)} minLength={5} maxLength={3000} rows={3} required disabled={guardar.isPending} />
      </label>}
      {reembolso && <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-bold">Fecha del reembolso
          <input type="date" required value={fechaReembolso} onChange={(e) => setFechaReembolso(e.target.value)}
            disabled={guardar.isPending} className="mt-1 block w-full rounded-lg border border-borde bg-white p-2" />
        </label>
        <label className="block text-sm font-bold">Método del reembolso
          <input required value={metodo} onChange={(e) => setMetodo(e.target.value)} minLength={2} maxLength={100}
            disabled={guardar.isPending} className="mt-1 block w-full rounded-lg border border-borde bg-white p-2" />
        </label>
      </div>}
      <div className="space-y-2">
        <p className="text-sm font-bold">{reembolso ? "Comprobante del reembolso" : entregaSinCodigo ? "Comprobante de entrega" : cumplimiento ? "Evidencia de entrega" : devolucion ? "Evidencia de la devolución" : "Adjuntar evidencia"}</p>
        <input ref={entrada} type="file" hidden accept={Object.keys(formatosEvidencia).join(",")}
          disabled={guardar.isPending || Boolean(rutaCargada)}
          onChange={(e) => {
            const elegido = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!elegido) return;
            if (!formatosEvidencia[elegido.type] || elegido.size > 50 * 1024 * 1024) {
              setErrorArchivo("Selecciona una imagen, un video MP4 o un PDF de hasta 50 MB.");
              return;
            }
            setErrorArchivo("");
            setArchivo(elegido);
          }} />
        {archivo ? <ul className="max-w-40" aria-label="Vista previa de la evidencia">
          <VistaPreviaEvidencia archivo={archivo} deshabilitada={guardar.isPending || Boolean(rutaCargada)}
            eliminar={() => { setArchivo(null); setErrorArchivo(""); guardar.reset(); }} />
        </ul> : <Boton type="button" variante="contorno" disabled={guardar.isPending}
          onClick={() => entrada.current?.click()}>+ Añadir archivo</Boton>}
        {errorArchivo && <p role="alert" className="text-sm text-error">{errorArchivo}</p>}
      </div>
      {guardar.isError && <p role="alert" className="text-sm text-error">{guardar.error.message}</p>}
      {guardar.isSuccess && <p role="status" className="text-sm text-pino">Evidencia registrada.</p>}
      <Boton variante="contorno" type="submit" disabled={!archivo || guardar.isPending || !datosValidos}>{guardar.isPending ? "Subiendo…" : reembolso ? "Registrar reembolso" : entregaSinCodigo ? "Enviar reporte" : cumplimiento ? "Registrar entrega acordada" : devolucion ? "Registrar devolución" : "Adjuntar archivo"}</Boton>
    </form>
  );
}
