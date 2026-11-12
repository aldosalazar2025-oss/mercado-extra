import type { Tienda } from "@/lib/demoData";
import { km } from "@/lib/format";

export default function TarjetaTienda({ t }: { t: Tienda }) {
  return (
    <article className="flex gap-4 rounded-xl border border-borde bg-white p-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-mercado font-display text-2xl font-extrabold text-white" aria-hidden="true">
        {t.nombre.charAt(0)}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="font-display text-lg font-bold leading-snug">{t.nombre}</h3>
        <p className="text-sm text-suave">{t.categorias.join(", ")} · a {km(t.distanciaKm)}</p>
        <p className="text-sm font-bold">
          <span className="text-pino">{t.calificacion.toFixed(1)} de 5</span>
          <span className="font-normal text-suave"> · {t.ventas} ventas completadas</span>
        </p>
        <p className="flex flex-wrap gap-2 pt-1 text-sm">
          {t.domicilio && <span className="rounded-full bg-hoja px-3 py-0.5 font-semibold text-pino">Entrega a domicilio</span>}
          {t.recojo && <span className="rounded-full bg-maiz-suave px-3 py-0.5 font-semibold text-tinta">Recojo en tienda</span>}
        </p>
      </div>
    </article>
  );
}
