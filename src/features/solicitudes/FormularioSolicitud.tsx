import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import { useCategorias } from "@/features/catalogo/hooks";
import { comprimirImagen } from "@/lib/imagen";
import { supabase } from "@/lib/supabase";
import type { Solicitud } from "./tipos";

type Props = { solicitud?: Solicitud; onGuardado: (id: string) => void };

export default function FormularioSolicitud({ solicitud, onGuardado }: Props) {
  const { session } = useAuth();
  const cliente = useQueryClient();
  const categorias = useCategorias();
  const [titulo, setTitulo] = useState(solicitud?.title ?? "");
  const [descripcion, setDescripcion] = useState(solicitud?.description ?? "");
  const [categoria, setCategoria] = useState(solicitud?.category_id ?? "");
  const [talla, setTalla] = useState(solicitud?.attributes.talla ?? "");
  const [color, setColor] = useState(solicitud?.attributes.color ?? "");
  const [modelo, setModelo] = useState(solicitud?.attributes.modelo ?? "");
  const [presupuesto, setPresupuesto] = useState(solicitud ? String(solicitud.max_budget) : "");
  const [negociable, setNegociable] = useState(solicitud?.budget_negotiable ?? false);
  const [nuevas, setNuevas] = useState<File[]>([]);
  const [fotos, setFotos] = useState(solicitud?.request_images ?? []);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Las fotos de referencia están en un bucket privado: se muestran con enlaces temporales.
  const urls = useQuery({
    queryKey: ["fotos-solicitud", fotos.map((f) => f.path).join("|")],
    enabled: fotos.length > 0 && Boolean(supabase),
    queryFn: async () => {
      const mapa = new Map<string, string>();
      if (!supabase) return mapa;
      const { data } = await supabase.storage.from("request-images").createSignedUrls(fotos.map((f) => f.path), 3600);
      (data ?? []).forEach((x) => { if (x.path && x.signedUrl) mapa.set(x.path, x.signedUrl); });
      return mapa;
    },
  });

  async function quitarFoto(f: { id: string; path: string }) {
    if (!supabase || !confirm("¿Quitar esta foto?")) return;
    const r = await supabase.from("request_images").delete().eq("id", f.id).select("id");
    if (r.error || !r.data?.length) return setError("No se pudo quitar la foto.");
    await supabase.storage.from("request-images").remove([f.path]);
    setFotos((x) => x.filter((y) => y.id !== f.id));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n: Record<string, string> = {};
    if (titulo.trim().length < 3) n.titulo = "Escribe qué producto necesitas (mínimo 3 letras).";
    if (!categoria) n.categoria = "Elige una categoría: así llega a las tiendas correctas.";
    const valor = Number(presupuesto);
    if (presupuesto.trim() === "" || Number.isNaN(valor) || valor <= 0) n.presupuesto = "Indica un presupuesto máximo mayor que cero (en soles).";
    if (fotos.length + nuevas.length > 5) n.fotos = "Puedes subir hasta 5 fotos de referencia.";
    setErrores(n);
    const uid = session?.user.id;
    if (Object.keys(n).length > 0 || !supabase || !uid) return;

    setEnviando(true);
    try {
      const id = solicitud?.id ?? crypto.randomUUID();
      const atributos: Record<string, string> = {};
      if (talla.trim()) atributos.talla = talla.trim();
      if (color.trim()) atributos.color = color.trim();
      if (modelo.trim()) atributos.modelo = modelo.trim();
      const campos = {
        title: titulo.trim(), description: descripcion.trim() || null, category_id: categoria, attributes: atributos,
        max_budget: Math.round(valor * 100) / 100, budget_negotiable: negociable,
      };
      if (solicitud) {
        const r = await supabase.from("requests").update(campos).eq("id", id).select("id");
        if (r.error || !r.data?.length) throw new Error("No se pudo guardar. Si la solicitud ya recibió ofertas, ya no se puede modificar.");
      } else {
        const r = await supabase.from("requests").insert({ id, buyer_id: uid, ...campos });
        if (r.error) throw new Error(r.error.message.includes("máximo 10") ? "Tienes demasiadas solicitudes abiertas (máximo 10). Cierra alguna antes de publicar otra." : "No se pudo publicar la solicitud.");
      }
      let fallidas = 0;
      for (const [i, archivo] of nuevas.entries()) {
        try {
          const blob = await comprimirImagen(archivo, 1400);
          const ruta = `${id}/ref-${Date.now()}-${i}.jpg`;
          const up = await supabase.storage.from("request-images").upload(ruta, blob, { contentType: "image/jpeg" });
          if (up.error) throw up.error;
          const fila = await supabase.from("request_images").insert({ request_id: id, path: ruta });
          if (fila.error) { await supabase.storage.from("request-images").remove([ruta]); throw fila.error; }
        } catch { fallidas += 1; }
      }
      await cliente.invalidateQueries({ queryKey: ["mis-solicitudes"] });
      if (fallidas > 0) setError(`La solicitud se guardó, pero ${fallidas} foto(s) no se pudieron subir. Puedes agregarlas editando la solicitud.`);
      onGuardado(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-xl border border-borde bg-white p-5" noValidate>
      <Campo etiqueta="¿Qué producto necesitas?" placeholder="Ej.: saco negro" value={titulo} onChange={(e) => setTitulo(e.target.value)} error={errores.titulo} />
      <Campo etiqueta="Descripción detallada" id="sol-descripcion">
        <textarea id="sol-descripcion" rows={3} className={estiloInput} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Para qué lo necesitas, estilo, material, algo que deba tener o evitar…" />
      </Campo>
      <Campo etiqueta="Categoría" id="sol-categoria" error={errores.categoria}>
        <select id="sol-categoria" className={estiloInput} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Elige una categoría</option>
          {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Campo>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-1 font-bold">Características (opcional)</legend>
        <Campo etiqueta="Talla o medida" value={talla} onChange={(e) => setTalla(e.target.value)} placeholder="M, 40, 2 m…" />
        <Campo etiqueta="Color" value={color} onChange={(e) => setColor(e.target.value)} />
        <Campo etiqueta="Modelo o marca" value={modelo} onChange={(e) => setModelo(e.target.value)} />
      </fieldset>
      <Campo etiqueta="Presupuesto máximo (S/)" type="number" min={0} step="0.01" inputMode="decimal" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} error={errores.presupuesto} />
      <label className="flex min-h-11 items-center gap-3 font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-[#1e6b45]" checked={negociable} onChange={(e) => setNegociable(e.target.checked)} /> Mi presupuesto es negociable
      </label>

      <fieldset className="space-y-2">
        <legend className="font-bold">Fotos de referencia (hasta 5, opcional)</legend>
        {fotos.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {fotos.map((f) => (
              <li key={f.id} className="space-y-1 text-center">
                {urls.data?.get(f.path) ? <img src={urls.data.get(f.path)} alt="" className="h-24 w-24 rounded-lg border border-borde object-cover" /> : <div className="h-24 w-24 rounded-lg bg-hoja" />}
                <button type="button" className="text-sm font-bold text-error underline" onClick={() => void quitarFoto(f)}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setNuevas(Array.from(e.target.files ?? []))} className={estiloInput} aria-label="Agregar fotos de referencia" />
        {nuevas.length > 0 && <p className="text-sm text-suave">{nuevas.length} foto(s) por subir al guardar.</p>}
        {errores.fotos && <p className="text-sm font-semibold text-error">{errores.fotos}</p>}
      </fieldset>

      {!solicitud && <p className="rounded-lg bg-maiz-suave p-3 text-sm">Tu solicitud estará abierta <strong>24 horas</strong> y solo la verán las tiendas que venden algo relacionado. Es gratis.</p>}
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? "Guardando…" : solicitud ? "Guardar cambios" : "Publicar solicitud"}</Boton>
    </form>
  );
}
