import { ofertasEjemplo } from "@/lib/demoData";
import { soles } from "@/lib/format";

// Muestra, con datos ficticios, la idea central: una solicitud y varias ofertas que compiten.
export default function Demo() {
  return (
    <div className="rounded-2xl bg-white p-5 text-tinta shadow-lg" role="img" aria-label="Ejemplo de solicitud con tres ofertas de tiendas">
      <p className="text-sm font-semibold text-suave">Solicitud de un comprador</p>
      <p className="font-display text-xl font-bold">Saco negro, talla M</p>
      <p className="text-suave">Presupuesto máximo {soles(200)} · negociable</p>
      <ul className="mt-4 space-y-2">
        {ofertasEjemplo.map((o, i) => (
          <li key={o.tienda} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${i === 0 ? "border-maiz bg-maiz-suave" : "border-borde"}`}>
            <div>
              <p className="font-bold">{o.tienda}</p>
              <p className="text-sm text-suave">{o.detalle}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold text-pino">{soles(o.precio)}</p>
              {i === 0 && <p className="text-xs font-bold">Mejor precio</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
