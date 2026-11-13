import { useState, type FormEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import TarjetaProducto from "@/components/TarjetaProducto";
import { TAM_PAGINA, buscarProductos, filtrosVacios, useCategorias, type Filtros } from "@/features/catalogo/hooks";
import { pedirUbicacion } from "@/lib/geo";

export default function Productos() {
  const [form, setForm] = useState<Filtros>(filtrosVacios);
  const [aplicados, setAplicados] = useState<Filtros>(filtrosVacios);
  const [aviso, setAviso] = useState<string | null>(null);
  const categorias = useCategorias();

  const consulta = useInfiniteQuery({
    queryKey: ["catalogo", aplicados],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => buscarProductos(aplicados, pageParam),
    getNextPageParam: (ultima, todas) => (ultima.length === TAM_PAGINA ? todas.length * TAM_PAGINA : undefined),
  });
  const productos = consulta.data?.pages.flat() ?? [];

  function cambiar<K extends keyof Filtros>(k: K, v: Filtros[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function usarUbicacion() {
    setAviso(null);
    try {
      const u = await pedirUbicacion();
      setForm((f) => ({ ...f, lat: u.lat, lng: u.lng, orden: "cerca" }));
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo obtener la ubicación.");
    }
  }

  function buscar(e: FormEvent) {
    e.preventDefault();
    setAplicados({ ...form });
  }

  function limpiar() {
    setForm(filtrosVacios);
    setAplicados(filtrosVacios);
    setAviso(null);
  }

  const conUbicacion = form.lat !== null && form.lng !== null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Explorar productos</h1>
      <form onSubmit={buscar} className="grid gap-4 rounded-xl border border-borde bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
        <Campo etiqueta="Buscar" placeholder="Ej.: saco negro" value={form.texto} onChange={(e) => cambiar("texto", e.target.value)} />
        <Campo etiqueta="Categoría" id="filtro-categoria">
          <select id="filtro-categoria" className={estiloInput} value={form.categoria} onChange={(e) => cambiar("categoria", e.target.value)}>
            <option value="">Todas</option>
            {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Precio mínimo (S/)" type="number" min={0} inputMode="decimal" value={form.precioMin} onChange={(e) => cambiar("precioMin", e.target.value)} />
        <Campo etiqueta="Precio máximo (S/)" type="number" min={0} inputMode="decimal" value={form.precioMax} onChange={(e) => cambiar("precioMax", e.target.value)} />
        <Campo etiqueta="Ordenar por" id="filtro-orden">
          <select id="filtro-orden" className={estiloInput} value={form.orden} onChange={(e) => cambiar("orden", e.target.value as Filtros["orden"])}>
            <option value="reciente">Más recientes</option>
            <option value="precio_asc">Menor precio</option>
            <option value="precio_desc">Mayor precio</option>
            {conUbicacion && <option value="cerca">Más cerca</option>}
          </select>
        </Campo>
        <div className="space-y-1">
          <span className="block font-bold">Cerca de mí</span>
          <Boton type="button" variante="contorno" onClick={usarUbicacion} className="w-full">{conUbicacion ? "Ubicación activada" : "Usar mi ubicación"}</Boton>
        </div>
        {conUbicacion && (
          <Campo etiqueta="Distancia máxima" id="filtro-radio">
            <select id="filtro-radio" className={estiloInput} value={form.radioKm} onChange={(e) => cambiar("radioKm", e.target.value)}>
              <option value="">Cualquiera</option>
              <option value="1">Hasta 1 km</option>
              <option value="3">Hasta 3 km</option>
              <option value="5">Hasta 5 km</option>
              <option value="10">Hasta 10 km</option>
            </select>
          </Campo>
        )}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Boton type="submit" variante="secundario">Buscar</Boton>
          <Boton type="button" variante="contorno" onClick={limpiar}>Limpiar</Boton>
        </div>
      </form>
      {aviso && <p role="alert" className="text-sm font-semibold text-error">{aviso}</p>}

      {consulta.isLoading && <p className="text-suave">Buscando…</p>}
      {consulta.error && <p role="alert" className="text-error">No se pudo cargar el catálogo. Inténtalo de nuevo.</p>}
      {!consulta.isLoading && !consulta.error && productos.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-suave">No encontramos productos con esos filtros. Prueba quitar alguno, o publica una solicitud para que las tiendas te ofrezcan lo que buscas.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{productos.map((p) => <TarjetaProducto key={p.id} p={p} />)}</div>
      {consulta.hasNextPage && (
        <div className="text-center">
          <Boton variante="contorno" onClick={() => void consulta.fetchNextPage()} disabled={consulta.isFetchingNextPage}>{consulta.isFetchingNextPage ? "Cargando…" : "Ver más productos"}</Boton>
        </div>
      )}
    </main>
  );
}
