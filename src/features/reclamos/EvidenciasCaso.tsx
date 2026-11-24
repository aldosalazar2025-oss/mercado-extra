import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";
import { accion, useCasosMutation } from "./casos";

const bucketCasos = "claim-evidence";
const formatos: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "application/pdf": "pdf",
};

export function ArchivosCaso({ rutas, bucket = bucketCasos }: { rutas: string[]; bucket?: string }) {
  const consulta = useQuery({
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
  if (!rutas.length) return null;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-bold">Evidencias</p>
      {consulta.isPending && <p>Cargando archivos…</p>}
      {consulta.isError && <p role="alert">No se pudieron abrir los archivos.</p>}
      <ul className="space-y-1">{consulta.data?.map((archivo, i) => (
        <li key={rutas[i]}>{archivo.signedUrl
          ? <a href={archivo.signedUrl} target="_blank" rel="noreferrer" className="font-bold text-mercado underline">Ver evidencia {i + 1}</a>
          : "Archivo no disponible"}</li>
      ))}</ul>
    </div>
  );
}

export function AdjuntarEvidencia({ id, uid, cancelacion = false, devolucion = false, cumplimiento = false, entregaSinCodigo = false }: { id: string; uid: string; cancelacion?: boolean; devolucion?: boolean; cumplimiento?: boolean; entregaSinCodigo?: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [motivo, setMotivo] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [rutaCargada, setRutaCargada] = useState<string | null>(null);
  const guardar = useCasosMutation(async (file: File) => {
    if (!supabase) throw new Error("Sin conexión");
    const extension = formatos[file.type];
    if (!extension || file.size > 50 * 1024 * 1024) throw new Error("Usa una imagen JPG, PNG o WebP, un video MP4 o un PDF de hasta 50 MB.");
    const carpeta = entregaSinCodigo ? `entregas-sin-codigo/${id}/${uid}` : devolucion || cumplimiento ? `devoluciones/${id}/${uid}` : cancelacion ? `cancelaciones/${id}/${uid}` : `${id}/${uid}`;
    const ruta = rutaCargada ?? `${carpeta}/${crypto.randomUUID()}.${extension}`;
    if (!rutaCargada) {
      const { error } = await supabase.storage.from(bucketCasos).upload(ruta, file);
      if (error) throw new Error(error.message);
      setRutaCargada(ruta);
    }
    if (entregaSinCodigo) {
      await accion("gestionar_cierre_pedido", { p_order: id, p_accion: "reportar", p_nota: motivo.trim(), p_evidencia: ruta });
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
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      if (archivo && (!entregaSinCodigo || motivo.trim().length >= 5)) guardar.mutate(archivo);
    }}>
      {entregaSinCodigo && <label className="block text-sm font-bold">¿Cómo se entregó el producto?
        <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" value={motivo}
          onChange={(e) => setMotivo(e.target.value)} minLength={5} maxLength={3000} rows={3} required disabled={guardar.isPending} />
      </label>}
      <label className="block text-sm font-bold">{entregaSinCodigo ? "Comprobante de entrega" : cumplimiento ? "Evidencia de entrega" : devolucion ? "Evidencia de la devolución" : "Adjuntar evidencia"}
        <input ref={entrada} type="file" accept={Object.keys(formatos).join(",")}
          className={cancelacion ? "mt-1 block w-full text-sm font-normal" :
            "mt-2 block w-full text-sm font-normal text-suave file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-hoja file:px-3 file:py-2 file:font-semibold file:text-pino"}
          disabled={guardar.isPending || Boolean(rutaCargada)}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </label>
      {guardar.isError && <p role="alert" className="text-sm text-error">{guardar.error.message}</p>}
      {guardar.isSuccess && <p role="status" className="text-sm text-pino">Evidencia registrada.</p>}
      <Boton variante="contorno" type="submit" disabled={!archivo || guardar.isPending || (entregaSinCodigo && motivo.trim().length < 5)}>{guardar.isPending ? "Subiendo…" : entregaSinCodigo ? "Enviar reporte" : cumplimiento ? "Registrar entrega acordada" : devolucion ? "Registrar devolución" : "Adjuntar archivo"}</Boton>
    </form>
  );
}
