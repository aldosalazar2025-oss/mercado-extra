import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import TarjetaTienda, { type TiendaCard } from "@/components/TarjetaTienda";
import { useCategorias } from "@/features/catalogo/hooks";
import { distanciaKm, pedirUbicacion, type Ubicacion } from "@/lib/geo";
import { supabase } from "@/lib/supabase";

type Fila = {
  id: string; name: string; address: string | null; logo_path: string | null; latitude: number | null; longitude: number | null;
  offers_delivery: boolean; offers_pickup: boolean;
  store_categories: { category_id: string; categories: { name: string } | null }[];
};

export default function Tiendas() {
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const categorias = useCategorias();

  const consulta = useQuery({
    queryKey: ["tiendas-publicas"],
    queryFn: async (): Promise<Fila[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,address,logo_path,latitude,longitude,offers_delivery,offers_pickup,store_categories(category_id,categories(name))")
        .eq("status", "aprobada")
        .order("name")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const lista = useMemo<TiendaCard[]>(() => {
    const t = texto.trim().toLowerCase();
    const filas = (consulta.data ?? [])
      .filter((s) => (!t || s.name.toLowerCase().includes(t)) && (!categoria || s.store_categories.some((c) => c.category_id === categoria)))
      .map<TiendaCard>((s) => ({
        id: s.id, name: s.name, address: s.address, logo_path: s.logo_path,
        offers_delivery: s.offers_delivery, offers_pickup: s.offers_pickup,
        categorias: s.store_categories.map((c) => c.categories?.name).filter((n): n is string => Boolean(n)),
        distanciaKm: ubicacion && s.latitude !== null && s.longitude !== null ? distanciaKm(ubicacion, { lat: s.latitude, lng: s.longitude }) : null,
      }));
    return ubicacion ? filas.sort((a, b) => (a.distanciaKm ?? 1e9) - (b.distanciaKm ?? 1e9)) : filas;
  }, [consulta.data, texto, categoria, ubicacion]);

  async function cerca() {
    setAviso(null);
    try { setUbicacion(await pedirUbicacion()); } catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo obtener la ubicación."); }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Explorar tiendas</h1>
      <div className="grid gap-4 rounded-xl border border-borde bg-white p-4 sm:grid-cols-3">
        <Campo etiqueta="Buscar tienda" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Campo etiqueta="Categoría" id="tiendas-categoria">
          <select id="tiendas-categoria" className={estiloInput} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Campo>
        <div className="space-y-1">
          <span className="block font-bold">Cerca de mí</span>
          <Boton type="button" variante="contorno" className="w-full" onClick={cerca}>{ubicacion ? "Ordenadas por cercanía" : "Usar mi ubicación"}</Boton>
        </div>
      </div>
      {aviso && <p role="alert" className="text-sm font-semibold text-error">{aviso}</p>}
      {consulta.isLoading && <p className="text-suave">Cargando…</p>}
      {consulta.error && <p role="alert" className="text-error">No se pudieron cargar las tiendas.</p>}
      {!consulta.isLoading && lista.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">Todavía no hay tiendas que coincidan.</p>}
      <div className="grid gap-4 md:grid-cols-2">{lista.map((t) => <TarjetaTienda key={t.id} t={t} />)}</div>
    </main>
  );
}
