import { Link } from "react-router-dom";
import type { ProductoCatalogo } from "@/features/catalogo/tipos";
import { km, soles } from "@/lib/format";
import { urlPublica } from "@/lib/storage";

export default function TarjetaProducto({ p }: { p: ProductoCatalogo }) {
  const foto = urlPublica(p.image_path);
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-borde bg-white">
      <Link to={`/productos/${p.id}`} className="block" aria-label={`Ver ${p.name}`}>
        {foto ? (
          <img src={foto} alt={p.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-hoja font-display text-5xl font-extrabold text-mercado/40" aria-hidden="true">
            {p.name.charAt(0)}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-lg font-bold leading-snug">
          <Link to={`/productos/${p.id}`} className="hover:underline">{p.name}</Link>
        </h3>
        <p className="text-2xl font-extrabold text-pino">{soles(p.price)}</p>
        <p className="text-sm text-suave">
          <Link to={`/tiendas/${p.store_id}`} className="font-semibold hover:underline">{p.store_name}</Link>
          {p.distancia_km !== null && ` · a ${km(p.distancia_km)}`}
        </p>
        <p className={`mt-auto w-fit rounded-full px-3 py-1 text-sm font-bold ${p.available ? "bg-hoja text-pino" : "bg-borde text-suave"}`}>
          {p.available ? "Disponible" : "Agotado"}
        </p>
      </div>
    </article>
  );
}
