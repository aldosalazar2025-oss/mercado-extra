import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { tiempoRestante } from "./tipos";

type Fila = {
  request_id: string;
  store_id: string;
  score: number;
  matched_by: string[];
  stores: { name: string } | null;
  requests: {
    id: string; title: string; description: string | null; attributes: { talla?: string; color?: string; modelo?: string };
    max_budget: number; budget_negotiable: boolean; status: string; expires_at: string;
    categories: { name: string } | null; request_images: { id: string; path: string }[];
  };
};

const motivo: Record<string, string> = { categoria: "categoría", producto: "tus productos", etiqueta: "tus etiquetas" };

export default function SolicitudesRecibidas() {
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const lista = useQuery({
    queryKey: ["solicitudes-recibidas"],
    refetchInterval: 60000,
    queryFn: async () => {
      if (!supabase) return { filas: [] as Fila[], urls: new Map<string, string>() };
      const { data, error } = await supabase
        .from("request_matches")
        .select("request_id,store_id,score,matched_by,stores(name),requests!inner(id,title,description,attributes,max_budget,budget_negotiable,status,expires_at,categories(name),request_images(id,path))")
        .eq("dismissed", false)
        .in("requests.status", ["abierta", "con_ofertas"])
        .gt("requests.expires_at", new Date().toISOString())
        .order("score", { ascending: false });
      if (error) throw error;
      const filas = (data ?? []) as unknown as Fila[];
      const urls = new Map<string, string>();
      const rutas = filas.flatMap((f) => f.requests.request_images.map((i) => i.path));
      if (rutas.length > 0) {
        const firmadas = await supabase.storage.from("request-images").createSignedUrls(rutas, 3600);
        (firmadas.data ?? []).forEach((x) => { if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl); });
      }
      return { filas, urls };
    },
  });

  const descartar = useMutation({
    mutationFn: async (f: Fila) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.from("request_matches").update({ dismissed: true }).eq("request_id", f.request_id).eq("store_id", f.store_id).select("request_id");
      if (r.error || !r.data?.length) throw new Error("No se pudo descartar. Puede que no tengas permiso.");
    },
    onSuccess: () => { setMensaje("Solicitud descartada."); void cliente.invalidateQueries({ queryKey: ["solicitudes-recibidas"] }); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  const tiendas = new Set(lista.data?.filas.map((f) => f.store_id));

  return (
    <div className="space-y-4">
      <p className="text-suave">Solicitudes de compradores relacionadas con lo que vendes. Solo ves las que corresponden a tu categoría y a tus productos.</p>
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudieron cargar las solicitudes.</p>}
      {lista.data?.filas.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-suave">Por ahora no hay solicitudes para tus tiendas. Cuando un comprador pida algo relacionado, te avisaremos. Para recibir más, completa las categorías de tu tienda y publica tus productos.</p>
      )}
      <ul className="space-y-3">
        {lista.data?.filas.map((f) => {
          const s = f.requests;
          const carac = [s.attributes.talla && `Talla: ${s.attributes.talla}`, s.attributes.color && `Color: ${s.attributes.color}`, s.attributes.modelo && `Modelo: ${s.attributes.modelo}`].filter(Boolean).join(" · ");
          return (
            <li key={`${f.request_id}-${f.store_id}`} className="space-y-3 rounded-xl border border-borde bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="font-display text-lg font-bold">{s.title}</p>
                  <p className="text-sm text-suave">{[s.categories?.name, `Hasta ${soles(s.max_budget)}${s.budget_negotiable ? " (negociable)" : ""}`, carac].filter(Boolean).join(" · ")}</p>
                  {s.description && <p className="text-sm">{s.description}</p>}
                  {tiendas.size > 1 && <p className="text-sm font-semibold">Para: {f.stores?.name}</p>}
                  <p className="text-xs text-suave">Coincide por: {f.matched_by.map((m) => motivo[m] ?? m).join(", ")}</p>
                </div>
                <p className="text-sm font-semibold">{tiempoRestante(s.expires_at, ahora)}</p>
              </div>
              {s.request_images.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {s.request_images.map((i) => (
                    <li key={i.id}>{lista.data?.urls.get(i.path) ? <img src={lista.data.urls.get(i.path)} alt="Foto de referencia" className="h-24 w-24 rounded-lg border border-borde object-cover" /> : <div className="h-24 w-24 rounded-lg bg-hoja" />}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Boton variante="secundario" disabled title="Disponible en la Etapa 10">Enviar oferta</Boton>
                <Boton variante="contorno" disabled={descartar.isPending} onClick={() => { if (confirm("¿Descartar esta solicitud? Dejará de aparecerte.")) descartar.mutate(f); }}>No me interesa</Boton>
                <span className="text-sm text-suave">Enviar ofertas se activa en la siguiente etapa.</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
