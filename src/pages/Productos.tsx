import { useMemo, useState } from "react";
import TarjetaProducto from "@/components/TarjetaProducto";
import Campo, { estiloInput } from "@/components/Campo";
import { categorias, productos } from "@/lib/demoData";

export default function Productos() {
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [maximo, setMaximo] = useState("");
  const [orden, setOrden] = useState("cerca");

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const tope = Number(maximo);
    return productos
      .filter((p) => (!t || p.nombre.toLowerCase().includes(t)) && (!categoria || p.categoria === categoria) && (!tope || p.precio <= tope))
      .sort((a, b) => (orden === "precio" ? a.precio - b.precio : a.distanciaKm - b.distanciaKm));
  }, [texto, categoria, maximo, orden]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Explorar productos</h1>
      <div className="grid gap-4 rounded-xl border border-borde bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Buscar" placeholder="Ej.: taladro" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Campo etiqueta="Categoría" id="filtro-categoria">
          <select id="filtro-categoria" className={estiloInput} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Precio máximo (S/)" type="number" min={0} inputMode="numeric" value={maximo} onChange={(e) => setMaximo(e.target.value)} />
        <Campo etiqueta="Ordenar por" id="filtro-orden">
          <select id="filtro-orden" className={estiloInput} value={orden} onChange={(e) => setOrden(e.target.value)}>
            <option value="cerca">Más cerca</option>
            <option value="precio">Menor precio</option>
          </select>
        </Campo>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-suave">No hay productos con esos filtros. Prueba quitar alguno, o publica una solicitud para que las tiendas te ofrezcan lo que buscas.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{lista.map((p) => <TarjetaProducto key={p.id} p={p} />)}</div>
      )}
    </main>
  );
}
