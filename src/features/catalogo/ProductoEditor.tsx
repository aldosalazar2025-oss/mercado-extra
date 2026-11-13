import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { useMisTiendas, usePermisosTienda } from "@/features/tiendas/hooks";
import { comprimirImagen } from "@/lib/imagen";
import { supabase } from "@/lib/supabase";
import { urlPublica } from "@/lib/storage";
import { useCategorias } from "./hooks";

type Producto = {
  id: string; store_id: string; category_id: string; name: string; description: string | null; price: number;
  available: boolean; status: "activo" | "oculto" | "eliminado";
  product_images: { id: string; path: string; sort: number }[]; product_tags: { tag: string }[];
};

function Formulario({ tiendaId, producto }: { tiendaId: string; producto: Producto | null }) {
  const ir = useNavigate();
  const cliente = useQueryClient();
  const categorias = useCategorias();
  const [nombre, setNombre] = useState(producto?.name ?? "");
  const [descripcion, setDescripcion] = useState(producto?.description ?? "");
  const [categoria, setCategoria] = useState(producto?.category_id ?? "");
  const [precio, setPrecio] = useState(producto ? String(producto.price) : "");
  const [disponible, setDisponible] = useState(producto?.available ?? true);
  const [publicado, setPublicado] = useState((producto?.status ?? "activo") === "activo");
  const [etiquetas, setEtiquetas] = useState(producto?.product_tags.map((t) => t.tag).join(", ") ?? "");
  const [nuevas, setNuevas] = useState<File[]>([]);
  const [fotos, setFotos] = useState([...(producto?.product_images ?? [])].sort((a, b) => a.sort - b.sort));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function quitarFoto(f: { id: string; path: string }) {
    if (!supabase || !confirm("¿Quitar esta foto?")) return;
    const r = await supabase.from("product_images").delete().eq("id", f.id).select("id");
    if (r.error || !r.data?.length) return setError("No se pudo quitar la foto.");
    await supabase.storage.from("public-catalog").remove([f.path]);
    setFotos((x) => x.filter((y) => y.id !== f.id));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n: Record<string, string> = {};
    if (nombre.trim().length < 2) n.nombre = "Escribe el nombre del producto.";
    if (!categoria) n.categoria = "Elige una categoría.";
    const valor = Number(precio);
    if (precio.trim() === "" || Number.isNaN(valor) || valor < 0) n.precio = "Escribe un precio válido (en soles).";
    const lista = [...new Set(etiquetas.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (lista.some((t) => t.length < 2 || t.length > 40) || lista.length > 10) n.etiquetas = "Hasta 10 etiquetas, de 2 a 40 letras cada una.";
    if (fotos.length + nuevas.length > 6) n.fotos = "Un producto admite hasta 6 fotos.";
    setErrores(n);
    if (Object.keys(n).length > 0 || !supabase) return;

    setEnviando(true);
    try {
      const id = producto?.id ?? crypto.randomUUID();
      const campos = {
        name: nombre.trim(), description: descripcion.trim() || null, category_id: categoria, price: Math.round(valor * 100) / 100,
        available: disponible, status: publicado ? "activo" : "oculto",
      };
      if (producto) {
        const r = await supabase.from("products").update(campos).eq("id", id).select("id");
        if (r.error || !r.data?.length) throw new Error("No se pudo guardar el producto. Puede que no tengas permiso.");
      } else {
        const r = await supabase.from("products").insert({ id, store_id: tiendaId, ...campos });
        if (r.error) throw new Error("No se pudo crear el producto.");
      }
      await supabase.from("product_tags").delete().eq("product_id", id);
      if (lista.length > 0) {
        const t = await supabase.from("product_tags").insert(lista.map((tag) => ({ product_id: id, tag })));
        if (t.error) throw new Error("El producto se guardó, pero no se pudieron guardar las etiquetas.");
      }
      let fallidas = 0;
      for (const [i, archivo] of nuevas.entries()) {
        try {
          const blob = await comprimirImagen(archivo, 1400);
          const ruta = `${tiendaId}/p-${id}-${Date.now()}-${i}.jpg`;
          const up = await supabase.storage.from("public-catalog").upload(ruta, blob, { contentType: "image/jpeg" });
          if (up.error) throw up.error;
          const fila = await supabase.from("product_images").insert({ product_id: id, path: ruta });
          if (fila.error) { await supabase.storage.from("public-catalog").remove([ruta]); throw fila.error; }
        } catch { fallidas += 1; }
      }
      await cliente.invalidateQueries({ queryKey: ["mis-productos"] });
      await cliente.invalidateQueries({ queryKey: ["producto", id] });
      if (fallidas > 0) {
        setError(`El producto se guardó, pero ${fallidas} foto(s) no se pudieron subir. Abre el producto para volver a intentarlo.`);
        if (!producto) ir(`/vendedor/mis-productos/${id}`, { replace: true });
        return;
      }
      ir("/vendedor/mis-productos", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-xl border border-borde bg-white p-5" noValidate>
      <Campo etiqueta="Nombre del producto" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
      <Campo etiqueta="Descripción" id="prod-descripcion">
        <textarea id="prod-descripcion" rows={4} className={estiloInput} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Material, medidas, estado, marca…" />
      </Campo>
      <Campo etiqueta="Categoría" id="prod-categoria" error={errores.categoria}>
        <select id="prod-categoria" className={estiloInput} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Elige una categoría</option>
          {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Precio (S/)" type="number" min={0} step="0.01" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} error={errores.precio} />
      <Campo etiqueta="Etiquetas (separadas por coma)" value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="saco, formal, negro" ayuda="Ayudan a que te encuentren en el buscador." error={errores.etiquetas} />
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#1e6b45]" checked={disponible} onChange={(e) => setDisponible(e.target.checked)} /> Disponible (hay stock)</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#1e6b45]" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} /> Publicado en el catálogo</label>

      <fieldset className="space-y-2">
        <legend className="font-bold">Fotos (hasta 6; la primera es la principal)</legend>
        {fotos.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {fotos.map((f) => (
              <li key={f.id} className="space-y-1 text-center">
                <img src={urlPublica(f.path) ?? ""} alt="" className="h-24 w-24 rounded-lg border border-borde object-cover" />
                <button type="button" className="text-sm font-bold text-error underline" onClick={() => void quitarFoto(f)}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setNuevas(Array.from(e.target.files ?? []))} className={estiloInput} aria-label="Agregar fotos" />
        {nuevas.length > 0 && <p className="text-sm text-suave">{nuevas.length} foto(s) por subir al guardar.</p>}
        {errores.fotos && <p className="text-sm font-semibold text-error">{errores.fotos}</p>}
      </fieldset>

      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}</Boton>
        <Link to="/vendedor/mis-productos" className="inline-flex min-h-11 items-center px-4 font-bold text-mercado underline">Cancelar</Link>
      </div>
    </form>
  );
}

export default function ProductoEditor() {
  const { productoId } = useParams();
  const [params] = useSearchParams();
  const tiendas = useMisTiendas();

  const existente = useQuery({
    queryKey: ["producto-editar", productoId],
    enabled: Boolean(productoId && supabase),
    queryFn: async () => {
      if (!supabase || !productoId) return null;
      const { data, error } = await supabase
        .from("products")
        .select("id,store_id,category_id,name,description,price,available,status,product_images(id,path,sort),product_tags(tag)")
        .eq("id", productoId).maybeSingle();
      if (error) throw error;
      return data as unknown as Producto | null;
    },
  });

  const tiendaId = productoId ? existente.data?.store_id : params.get("tienda") ?? undefined;
  const tienda = tiendas.data?.find((t) => t.id === tiendaId);
  const permisos = usePermisosTienda(tiendaId, tienda?.owner_id);

  if (existente.isLoading || tiendas.isLoading || permisos.isLoading) return <p className="text-suave">Cargando…</p>;
  if (!tiendaId || !tienda || (productoId && !existente.data)) {
    return <p className="rounded-xl bg-white p-6 text-suave">No encontramos ese producto o la tienda no está entre las tuyas. <Link to="/vendedor/mis-productos" className="font-bold text-mercado underline">Volver</Link></p>;
  }
  if (!permisos.data?.permisos.has("gestionar_productos")) {
    return <p className="rounded-xl bg-white p-6 text-suave">No tienes permiso para gestionar productos en esta tienda.</p>;
  }
  return (
    <div className="space-y-4">
      <p><Link to="/vendedor/mis-productos" className="font-bold text-mercado underline">← Mis productos</Link></p>
      <h2 className="font-display text-2xl font-extrabold">{productoId ? "Editar producto" : `Nuevo producto en ${tienda.name}`}</h2>
      <Formulario key={existente.data?.id ?? "nuevo"} tiendaId={tiendaId} producto={existente.data ?? null} />
    </div>
  );
}
