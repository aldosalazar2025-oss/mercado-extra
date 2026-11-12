import type { Producto } from "@/lib/demoData";
import { km, soles } from "@/lib/format";

export default function TarjetaProducto({ p }: { p: Producto }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-borde bg-white">
      <div className="flex aspect-[4/3] items-center justify-center bg-hoja font-display text-5xl font-extrabold text-mercado/40" aria-hidden="true">
        {p.nombre.charAt(0)}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-lg font-bold leading-snug">{p.nombre}</h3>
        <p className="text-2xl font-extrabold text-pino">{soles(p.precio)}</p>
        <p className="text-sm text-suave">{p.tienda} · a {km(p.distanciaKm)}</p>
        <p className={`mt-auto w-fit rounded-full px-3 py-1 text-sm font-bold ${p.disponible ? "bg-hoja text-pino" : "bg-borde text-suave"}`}>
          {p.disponible ? "Disponible" : "Agotado"}
        </p>
      </div>
    </article>
  );
}
