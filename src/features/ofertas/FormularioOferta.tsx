import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { comprimirImagen } from "@/lib/imagen";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { COLUMNAS_VERSION, ordenarVersiones, propuestaPendiente, traducirError, versionVigente, type EstadoOferta, type Version } from "./tipos";

type Contexto = {
  solicitud: { id: string; title: string; description: string | null; max_budget: number; budget_negotiable: boolean; status: string; expires_at: string; categories: { name: string } | null } | null;
  oferta: { id: string; status: EstadoOferta; current_version_id: string | null; offer_history: Version[] } | null;
};

function Campos({ requestId, storeId, ctx, onEnviado }: { requestId: string; storeId: string; ctx: Contexto; onEnviado: () => void }) {
  const cliente = useQueryClient();
  const versiones = ordenarVersiones(ctx.oferta?.offer_history ?? []);
  const ultima = ctx.oferta ? versionVigente(versiones, ctx.oferta.status, ctx.oferta.current_version_id) : undefined;
  const [precio, setPrecio] = useState(ultima ? String(ultima.price) : "");
  const [descripcion, setDescripcion] = useState(ultima?.description ?? "");
  const [disponibilidad, setDisponibilidad] = useState(ultima?.availability ?? "");
  const [entrega, setEntrega] = useState(ultima?.delivery_terms ?? "");
  const [tiempo, setTiempo] = useState(ultima?.eta ?? "");
  const [notas, setNotas] = useState(ultima?.notes ?? "");
  const [previas, setPrevias] = useState<string[]>(ultima?.photo_paths ?? []);
  const [nuevas, setNuevas] = useState<File[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const urls = useQuery({
    queryKey: ["fotos-oferta", previas.join("|")],
    enabled: previas.length > 0 && Boolean(supabase),
    queryFn: async () => {
      const m = new Map<string, string>();
      if (!supabase) return m;
      const { data } = await supabase.storage.from("offer-images").createSignedUrls(previas, 3600);
      (data ?? []).forEach((x) => { if (x.path && x.signedUrl) m.set(x.path, x.signedUrl); });
      return m;
    },
  });

  const s = ctx.solicitud;
  const valor = Number(precio);
  const excede = s && valor > s.max_budget;
  const estado = ctx.oferta?.status;
  const pendiente = ctx.oferta ? propuestaPendiente(versiones, ctx.oferta.status) : null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n: Record<string, string> = {};
    if (precio.trim() === "" || Number.isNaN(valor) || valor <= 0) n.precio = "Indica un precio mayor que cero (en soles).";
    if (previas.length + nuevas.length > 5) n.fotos = "Puedes adjuntar hasta 5 fotos.";
    setErrores(n);
    if (Object.keys(n).length > 0 || !supabase) return;

    setEnviando(true);
    const subidas: string[] = [];
    try {
      for (const [i, archivo] of nuevas.entries()) {
        const blob = await comprimirImagen(archivo, 1400);
        const ruta = `${requestId}/${storeId}/o-${Date.now()}-${i}.jpg`;
        const up = await supabase.storage.from("offer-images").upload(ruta, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error("No se pudo subir una de las fotos.");
        subidas.push(ruta);
      }
      const r = await supabase.rpc("enviar_oferta", {
        p_request: requestId, p_store: storeId, p_price: valor, p_description: descripcion, p_availability: disponibilidad,
        p_delivery_terms: entrega, p_eta: tiempo, p_notes: notas, p_photos: [...previas, ...subidas],
      });
      if (r.error) throw new Error(traducirError(r.error.message));
      await cliente.invalidateQueries({ queryKey: ["mis-ofertas"] });
      await cliente.invalidateQueries({ queryKey: ["solicitudes-recibidas"] });
      onEnviado();
    } catch (err) {
      if (subidas.length > 0 && supabase) await supabase.storage.from("offer-images").remove(subidas);
      setError(err instanceof Error ? err.message : "Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!s) return <p className="rounded-xl bg-white p-6 text-suave">No encontramos esa solicitud o ya no está disponible para tu tienda.</p>;
  if (estado === "rechazada" || estado === "retirada" || estado === "reemplazada") {
    return <p className="rounded-xl bg-white p-6 text-suave">Esta oferta ya no admite nuevas propuestas ({estado === "retirada" ? "la retiraste" : "el comprador eligió otra"}).</p>;
  }
  if (pendiente) {
    return <p className="rounded-xl bg-maiz-suave p-6">Ya enviaste una propuesta de {soles(pendiente.price)} y el comprador aún no responde. Podrás enviar otra cuando la acepte o la rechace.</p>;
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-xl border border-borde bg-white p-5" noValidate>
      <section className="space-y-1 rounded-lg bg-hoja p-3 text-sm">
        <p className="font-bold">Solicitud: {s.title}</p>
        <p>{[s.categories?.name, `Presupuesto máximo ${soles(s.max_budget)}${s.budget_negotiable ? " (negociable)" : ""}`].filter(Boolean).join(" · ")}</p>
        {s.description && <p>{s.description}</p>}
      </section>
      {ctx.oferta && estado === "aceptada" && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Tu oferta fue elegida. Un cambio de precio solo vale si el comprador lo acepta.</p>}
      {ctx.oferta && estado === "enviada" && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Estás enviando una <strong>nueva propuesta</strong>: reemplaza tu oferta actual, el comprador será avisado y la anterior queda en el historial.</p>}

      <Campo etiqueta="Precio ofrecido (S/)" type="number" min={0} step="0.01" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} error={errores.precio} />
      {excede && <p className="text-sm font-semibold">Tu precio supera el presupuesto del comprador ({soles(s.max_budget)}).{s.budget_negotiable ? " Él indicó que es negociable." : " Él no indicó que sea negociable."}</p>}
      <Campo etiqueta="Descripción del producto" id="of-descripcion">
        <textarea id="of-descripcion" rows={3} className={estiloInput} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Marca, material, estado, qué incluye…" />
      </Campo>
      <Campo etiqueta="Disponibilidad" value={disponibilidad} onChange={(e) => setDisponibilidad(e.target.value)} placeholder="Ej.: En stock, talla M y L" />
      <Campo etiqueta="Condiciones de entrega" value={entrega} onChange={(e) => setEntrega(e.target.value)} placeholder="Ej.: Entrega gratis en el centro; recojo en tienda" />
      <Campo etiqueta="Tiempo estimado" value={tiempo} onChange={(e) => setTiempo(e.target.value)} placeholder="Ej.: Hoy mismo, 2 días" />
      <Campo etiqueta="Observaciones" id="of-notas">
        <textarea id="of-notas" rows={2} className={estiloInput} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>

      <fieldset className="space-y-2">
        <legend className="font-bold">Fotos del producto (hasta 5)</legend>
        {previas.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {previas.map((p) => (
              <li key={p} className="space-y-1 text-center">
                {urls.data?.get(p) ? <img src={urls.data.get(p)} alt="" className="h-24 w-24 rounded-lg border border-borde object-cover" /> : <div className="h-24 w-24 rounded-lg bg-hoja" />}
                <button type="button" className="text-sm font-bold text-error underline" onClick={() => setPrevias((x) => x.filter((y) => y !== p))}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setNuevas(Array.from(e.target.files ?? []))} className={estiloInput} aria-label="Agregar fotos" />
        {nuevas.length > 0 && <p className="text-sm text-suave">{nuevas.length} foto(s) por subir.</p>}
        {errores.fotos && <p className="text-sm font-semibold text-error">{errores.fotos}</p>}
      </fieldset>

      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? "Enviando…" : ctx.oferta ? "Enviar nueva propuesta" : "Enviar oferta"}</Boton>
    </form>
  );
}

export default function FormularioOferta({ requestId, storeId, onEnviado }: { requestId: string; storeId: string; onEnviado: () => void }) {
  const consulta = useQuery({
    queryKey: ["oferta-contexto", requestId, storeId],
    enabled: Boolean(supabase),
    queryFn: async (): Promise<Contexto> => {
      if (!supabase) return { solicitud: null, oferta: null };
      const [r, o] = await Promise.all([
        supabase.from("requests").select("id,title,description,max_budget,budget_negotiable,status,expires_at,categories(name)").eq("id", requestId).maybeSingle(),
        supabase.from("offers").select(`id,status,current_version_id,offer_history!offer_history_offer_id_fkey(${COLUMNAS_VERSION})`).eq("request_id", requestId).eq("store_id", storeId).maybeSingle(),
      ]);
      return { solicitud: r.data as unknown as Contexto["solicitud"], oferta: o.data as unknown as Contexto["oferta"] };
    },
  });
  if (consulta.isLoading) return <p className="text-suave">Cargando…</p>;
  if (!consulta.data) return <p role="alert" className="text-error">No se pudo cargar la solicitud.</p>;
  return <Campos key={`${requestId}-${storeId}-${consulta.dataUpdatedAt}`} requestId={requestId} storeId={storeId} ctx={consulta.data} onEnviado={onEnviado} />;
}
