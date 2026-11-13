import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton, { clasesBoton } from "@/components/Boton";
import { estiloInput } from "@/components/Campo";
import { useMisTiendas, usePermisosPorTienda } from "@/features/tiendas/hooks";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { urlPublica } from "@/lib/storage";

type Fila = {
  id: string; name: string; price: number; available: boolean; status: "activo" | "oculto" | "eliminado";
  admin_hidden: boolean; admin_hidden_reason: string | null; product_images: { path: string; sort: number }[];
};

export default function MisProductos() {
  const tiendas = useMisTiendas();
  const [elegida, setElegida] = useState<string>("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const cliente = useQueryClient();
  const porTienda = usePermisosPorTienda();
  // Solo se listan las tiendas donde la persona puede gestionar productos.
  const gestionables = (tiendas.data ?? []).filter((t) => porTienda.data?.get(t.id)?.has("gestionar_productos"));
  const tienda = gestionables.find((t) => t.id === elegida) ?? gestionables[0];
  const puede = Boolean(tienda);

  const lista = useQuery({
    queryKey: ["mis-productos", tienda?.id],
    enabled: Boolean(tienda && supabase),
    queryFn: async (): Promise<Fila[]> => {
      if (!supabase || !tienda) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id,name,price,available,status,admin_hidden,admin_hidden_reason,product_images(path,sort)")
        .eq("store_id", tienda.id).neq("status", "eliminado").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const cambiar = useMutation({
    mutationFn: async (p: { id: string; campos: Partial<Pick<Fila, "available" | "status">> }) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.from("products").update(p.campos).eq("id", p.id).select("id");
      if (r.error || !r.data || r.data.length === 0) throw new Error("No se pudo guardar. Puede que no tengas permiso.");
    },
    onSuccess: () => { setMensaje(null); void cliente.invalidateQueries({ queryKey: ["mis-productos"] }); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  if (tiendas.isLoading || porTienda.isLoading) return <p className="text-suave">Cargando…</p>;
  if (!tienda && (tiendas.data?.length ?? 0) > 0) {
    return <p className="rounded-xl bg-white p-6 text-suave">Ninguna de tus tiendas te da permiso para gestionar productos. Si lo necesitas, pídeselo al propietario.</p>;
  }
  if (!tienda) {
    return (
      <p className="rounded-xl bg-white p-6 text-suave">
        Primero registra una tienda en <Link to="/vendedor/mis-tiendas" className="font-bold text-mercado underline">Mis tiendas</Link> para poder publicar productos.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        {gestionables.length > 1 && (
          <div className="min-w-[220px]">
            <label htmlFor="tienda-productos" className="block font-bold">Tienda</label>
            <select id="tienda-productos" className={estiloInput} value={tienda.id} onChange={(e) => setElegida(e.target.value)}>
              {gestionables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        {puede && <Link to={`/vendedor/mis-productos/nuevo?tienda=${tienda.id}`} className={clasesBoton("primario")}>Nuevo producto</Link>}
      </div>
      {tienda.status !== "aprobada" && (
        <p className="rounded-lg bg-maiz-suave p-3 text-sm">Tus productos se mostrarán en el catálogo cuando <strong>{tienda.name}</strong> sea aprobada. Mientras tanto puedes prepararlos.</p>
      )}
      {mensaje && <p role="alert" className="text-sm font-semibold text-error">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudieron cargar los productos.</p>}
      {lista.data?.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">Aún no tienes productos en esta tienda.</p>}
      <ul className="space-y-3">
        {lista.data?.map((p) => {
          const foto = urlPublica([...p.product_images].sort((a, b) => a.sort - b.sort)[0]?.path);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-borde bg-white p-4">
              {foto ? <img src={foto} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-hoja font-display text-2xl font-extrabold text-mercado/40" aria-hidden="true">{p.name.charAt(0)}</div>}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-display text-lg font-bold">{p.name}</p>
                <p className="font-bold text-pino">{soles(p.price)}</p>
                <p className="flex flex-wrap gap-2 text-sm">
                  <span className={`rounded-full px-3 py-0.5 font-semibold ${p.available ? "bg-hoja text-pino" : "bg-borde text-suave"}`}>{p.available ? "Disponible" : "Agotado"}</span>
                  <span className={`rounded-full px-3 py-0.5 font-semibold ${p.status === "activo" ? "bg-hoja text-pino" : "bg-borde text-suave"}`}>{p.status === "activo" ? "Publicado" : "Oculto"}</span>
                </p>
                {p.admin_hidden && <p className="text-sm font-semibold text-error">Retirado por la administración: {p.admin_hidden_reason ?? "sin detalle"}</p>}
              </div>
              {puede && (
                <div className="flex flex-wrap gap-2">
                  <Link to={`/vendedor/mis-productos/${p.id}`} className={clasesBoton("contorno")}>Editar</Link>
                  <Boton variante="contorno" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: p.id, campos: { available: !p.available } })}>{p.available ? "Marcar agotado" : "Marcar disponible"}</Boton>
                  <Boton variante="contorno" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: p.id, campos: { status: p.status === "activo" ? "oculto" : "activo" } })}>{p.status === "activo" ? "Ocultar" : "Publicar"}</Boton>
                  <Boton variante="contorno" disabled={cambiar.isPending} onClick={() => { if (confirm(`¿Eliminar «${p.name}»? Dejará de mostrarse.`)) cambiar.mutate({ id: p.id, campos: { status: "eliminado" } }); }}>Eliminar</Boton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
