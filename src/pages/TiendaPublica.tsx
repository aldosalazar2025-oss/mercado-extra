import ResenasPublicasTienda from "@/features/reputacion/ResenasPublicasTienda";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ResumenReputacion from "@/features/reputacion/ResumenReputacion";
import { usePromocionesPublicas } from "@/features/monetizacion/datos";
import TarjetaProducto from "@/components/TarjetaProducto";
import type { ProductoCatalogo } from "@/features/catalogo/tipos";
import { supabase } from "@/lib/supabase";
import { urlPublica } from "@/lib/storage";

type Tienda = {
  id: string; name: string; description: string | null; address: string | null; phone: string | null; logo_path: string | null;
  offers_delivery: boolean; offers_pickup: boolean; status: string;
  store_categories: { categories: { name: string } | null }[];
};
type FilaProducto = {
  id: string; name: string; description: string | null; price: number; available: boolean; category_id: string; created_at: string;
  categories: { name: string } | null; product_images: { path: string; sort: number }[];
};

export default function TiendaPublica() {
  const { id } = useParams();
  const [parametros, setParametros] = useSearchParams();
  const valor = Number(parametros.get("estrellas"));
  const estrellas = Number.isInteger(valor) && valor >= 1 && valor <= 5 ? valor : null;
  function filtrarResenas(puntuacion: number | null) {
    const siguientes = new URLSearchParams(parametros);
    if (puntuacion === null) siguientes.delete("estrellas");
    else siguientes.set("estrellas", String(puntuacion));
    setParametros(siguientes, { preventScrollReset: true });
  }
  const consulta = useQuery({
    queryKey: ["tienda-publica", id],
    enabled: Boolean(id && supabase),
    queryFn: async () => {
      if (!supabase || !id) return null;
      const t = await supabase
        .from("stores")
        .select("id,name,description,address,phone,logo_path,offers_delivery,offers_pickup,status,store_categories(categories(name))")
        .eq("id", id).eq("status", "aprobada").maybeSingle();
      if (t.error) throw t.error;
      if (!t.data) return null;
      const p = await supabase
        .from("products")
        .select("id,name,description,price,available,category_id,created_at,categories(name),product_images(path,sort)")
        .eq("store_id", id).eq("status", "activo").eq("admin_hidden", false)
        .order("created_at", { ascending: false }).limit(60);
      if (p.error) throw p.error;
      return { tienda: t.data as unknown as Tienda, productos: (p.data ?? []) as unknown as FilaProducto[] };
    },
  });

  const promociones = usePromocionesPublicas("productos", consulta.data?.productos.map((p) => p.id) ?? []);
  if (consulta.isLoading) return <main className="mx-auto max-w-4xl px-4 py-10 text-suave">Cargando…</main>;
  if (!consulta.data) {
    return (
      <main className="mx-auto max-w-xl space-y-3 px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-extrabold text-pino">Esta tienda no está disponible</h1>
        <Link to="/tiendas" className="font-bold text-mercado underline">Ver todas las tiendas</Link>
      </main>
    );
  }
  const { tienda: t, productos } = consulta.data;
  const logo = urlPublica(t.logo_path);
  const cards: ProductoCatalogo[] = productos.map((p) => ({
    id: p.id, name: p.name, description: p.description, price: p.price, available: p.available,
    category_id: p.category_id, category_name: p.categories?.name ?? "",
    store_id: t.id, store_name: t.name, store_address: t.address, offers_delivery: t.offers_delivery, offers_pickup: t.offers_pickup,
    distancia_km: null, image_path: [...p.product_images].sort((a, b) => a.sort - b.sort)[0]?.path ?? null, created_at: p.created_at,
  }));

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <p><Link to="/tiendas" className="font-bold text-mercado underline">← Tiendas</Link></p>
      <header className="flex flex-wrap items-start gap-5 rounded-2xl border border-borde border-t-4 border-t-mercado bg-white p-5 sm:p-7">
        {logo ? <img src={logo} alt="" className="h-20 w-20 shrink-0 rounded-xl border border-borde object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-mercado font-display text-3xl font-extrabold text-white" aria-hidden="true">{t.name.charAt(0)}</div>}
        <div className="min-w-48 flex-1 space-y-2">
          <h1 className="break-words font-display text-3xl font-extrabold text-pino">{t.name}</h1>
          <p className="text-sm text-suave">{t.store_categories.map((c) => c.categories?.name).filter(Boolean).join(", ")}</p>
          {t.description && <p className="whitespace-pre-line break-words">{t.description}</p>}
          {t.address && <p>{t.address}</p>}
          {t.phone && <p className="text-sm">Teléfono: {t.phone}</p>}
          <p className="flex flex-wrap gap-2 pt-1 text-sm">
            {t.offers_delivery && <span className="rounded-full bg-hoja px-3 py-0.5 font-semibold text-pino">Entrega a domicilio</span>}
            {t.offers_pickup && <span className="rounded-full bg-maiz-suave px-3 py-0.5 font-semibold text-tinta">Recojo en tienda</span>}
          </p>
        </div>
      </header>
      <section className="space-y-4 rounded-2xl border border-borde bg-white p-5 sm:p-7">
        <h2 className="font-display text-2xl font-extrabold text-pino">Calificaciones de la tienda</h2>
        <ResumenReputacion id={t.id} tipo="tienda" mostrarVentas mostrarDistribucion estrellas={estrellas} alFiltrar={filtrarResenas} />
        <ResenasPublicasTienda id={t.id} estrellas={estrellas} limpiar={() => filtrarResenas(null)} />
      </section>
      <h2 className="font-display text-2xl font-extrabold text-pino">Productos de la tienda</h2>
      {cards.length === 0 ? <p className="rounded-xl bg-white p-6 text-suave">Esta tienda aún no publicó productos.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((p) => <TarjetaProducto key={p.id} p={p} promocionado={promociones.data?.has(p.id)} />)}</div>
      )}
    </main>
  );
}
