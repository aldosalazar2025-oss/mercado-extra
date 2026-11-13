import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clasesBoton } from "@/components/Boton";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { urlPublica } from "@/lib/storage";

type Detalle = {
  id: string; name: string; description: string | null; price: number; available: boolean; admin_hidden: boolean; status: string;
  categories: { name: string } | null;
  stores: { id: string; name: string; address: string | null; phone: string | null; offers_delivery: boolean; offers_pickup: boolean } | null;
  product_images: { path: string; sort: number }[];
  product_tags: { tag: string }[];
};

export default function ProductoDetalle() {
  const { id } = useParams();
  const [indice, setIndice] = useState(0);
  const consulta = useQuery({
    queryKey: ["producto", id],
    enabled: Boolean(id && supabase),
    queryFn: async () => {
      if (!supabase || !id) return null;
      const { data, error } = await supabase
        .from("products")
        .select("id,name,description,price,available,admin_hidden,status,categories(name),stores(id,name,address,phone,offers_delivery,offers_pickup),product_images(path,sort),product_tags(tag)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Detalle | null;
    },
  });

  if (consulta.isLoading) return <main className="mx-auto max-w-4xl px-4 py-10 text-suave">Cargando…</main>;
  const p = consulta.data;
  if (!p) {
    return (
      <main className="mx-auto max-w-xl space-y-3 px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-extrabold text-pino">Este producto no está disponible</h1>
        <Link to="/productos" className="font-bold text-mercado underline">Volver al catálogo</Link>
      </main>
    );
  }
  const fotos = [...p.product_images].sort((a, b) => a.sort - b.sort).map((f) => urlPublica(f.path)).filter((u): u is string => Boolean(u));
  const visible = p.status === "activo" && !p.admin_hidden;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <p><Link to="/productos" className="font-bold text-mercado underline">← Catálogo</Link></p>
      {!visible && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">Este producto no se muestra al público ahora mismo.</p>}
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          {fotos.length > 0 ? (
            <>
              <img src={fotos[Math.min(indice, fotos.length - 1)]} alt={p.name} className="aspect-[4/3] w-full rounded-xl border border-borde object-cover" />
              {fotos.length > 1 && (
                <ul className="flex gap-2 overflow-x-auto">
                  {fotos.map((u, i) => (
                    <li key={u}>
                      <button type="button" onClick={() => setIndice(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === indice} className={`overflow-hidden rounded-lg border-2 ${i === indice ? "border-mercado" : "border-borde"}`}>
                        <img src={u} alt="" className="h-16 w-16 object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-hoja font-display text-7xl font-extrabold text-mercado/40" aria-hidden="true">{p.name.charAt(0)}</div>
          )}
        </div>
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-extrabold">{p.name}</h1>
          <p className="text-3xl font-extrabold text-pino">{soles(p.price)}</p>
          <p className={`w-fit rounded-full px-3 py-1 text-sm font-bold ${p.available ? "bg-hoja text-pino" : "bg-borde text-suave"}`}>{p.available ? "Disponible" : "Agotado"}</p>
          {p.categories && <p className="text-sm text-suave">Categoría: {p.categories.name}</p>}
          {p.description && <p className="whitespace-pre-line">{p.description}</p>}
          {p.product_tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">{p.product_tags.map((t) => <li key={t.tag} className="rounded-full border border-borde px-3 py-0.5 text-sm">{t.tag}</li>)}</ul>
          )}
          {p.stores && (
            <section className="space-y-1 rounded-xl border border-borde bg-white p-4">
              <p className="text-sm text-suave">Vendido por</p>
              <Link to={`/tiendas/${p.stores.id}`} className="font-display text-lg font-bold hover:underline">{p.stores.name}</Link>
              {p.stores.address && <p className="text-sm">{p.stores.address}</p>}
              <p className="text-sm text-suave">{[p.stores.offers_delivery ? "Entrega a domicilio" : null, p.stores.offers_pickup ? "Recojo en tienda" : null].filter(Boolean).join(" · ")}</p>
            </section>
          )}
          <div className="rounded-xl bg-maiz-suave p-4 text-sm">
            <p className="font-bold">¿Quieres otra talla, color o modelo?</p>
            <p className="mb-2">Publica una solicitud gratis y las tiendas te hacen su mejor oferta.</p>
            <Link to="/solicitar" className={clasesBoton("primario")}>Publicar una solicitud</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
