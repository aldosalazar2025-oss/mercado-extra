import { Link } from "react-router-dom";
import { km } from "@/lib/format";
import { urlPublica } from "@/lib/storage";

export type TiendaCard = {
  id: string;
  name: string;
  address: string | null;
  logo_path: string | null;
  offers_delivery: boolean;
  offers_pickup: boolean;
  categorias: string[];
  distanciaKm: number | null;
};

export default function TarjetaTienda({ t }: { t: TiendaCard }) {
  const logo = urlPublica(t.logo_path);
  return (
    <article className="flex gap-4 rounded-xl border border-borde bg-white p-4">
      {logo ? (
        <img src={logo} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-mercado font-display text-2xl font-extrabold text-white" aria-hidden="true">
          {t.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 space-y-1">
        <h3 className="font-display text-lg font-bold leading-snug">
          <Link to={`/tiendas/${t.id}`} className="hover:underline">{t.name}</Link>
        </h3>
        <p className="text-sm text-suave">
          {[t.categorias.join(", "), t.address, t.distanciaKm !== null ? `a ${km(t.distanciaKm)}` : null].filter(Boolean).join(" · ")}
        </p>
        <p className="flex flex-wrap gap-2 pt-1 text-sm">
          {t.offers_delivery && <span className="rounded-full bg-hoja px-3 py-0.5 font-semibold text-pino">Entrega a domicilio</span>}
          {t.offers_pickup && <span className="rounded-full bg-maiz-suave px-3 py-0.5 font-semibold text-tinta">Recojo en tienda</span>}
        </p>
      </div>
    </article>
  );
}
