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

export function AdjuntarEvidencia({ id, uid, cancelacion = false }: { id: string; uid: string; cancelacion?: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [rutaCargada, setRutaCargada] = useState<string | null>(null);
  const guardar = useCasosMutation(async (file: File) => {
    if (!supabase) throw new Error("Sin conexión");
    const extension = formatos[file.type];
    if (!extension || file.size > 50 * 1024 * 1024) throw new Error("Usa una imagen JPG, PNG o WebP, un video MP4 o un PDF de hasta 50 MB.");
    const carpeta = cancelacion ? `cancelaciones/${id}/${uid}` : `${id}/${uid}`;
    const ruta = rutaCargada ?? `${carpeta}/${crypto.randomUUID()}.${extension}`;
    if (!rutaCargada) {
      const { error } = await supabase.storage.from(bucketCasos).upload(ruta, file);
      if (error) throw new Error(error.message);
      setRutaCargada(ruta);
    }
    if (cancelacion) {
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
      if (archivo) guardar.mutate(archivo);
    }}>
      <label className="block text-sm font-bold">Adjuntar evidencia
        <input ref={entrada} type="file" accept={Object.keys(formatos).join(",")}
          className="mt-1 block w-full text-sm font-normal" disabled={guardar.isPending || Boolean(rutaCargada)}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </label>
      {guardar.isError && <p role="alert" className="text-sm text-error">{guardar.error.message}</p>}
      {guardar.isSuccess && <p role="status" className="text-sm text-pino">Evidencia registrada.</p>}
      <Boton variante="contorno" type="submit" disabled={!archivo || guardar.isPending}>{guardar.isPending ? "Subiendo…" : "Adjuntar archivo"}</Boton>
    </form>
  );
}
