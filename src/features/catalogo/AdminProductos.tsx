import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type Fila = {
  id: string; name: string; price: number; status: string; admin_hidden: boolean; admin_hidden_reason: string | null;
  stores: { name: string } | null; categories: { name: string } | null;
};

export default function AdminProductos() {
  const cliente = useQueryClient();
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const [solo, setSolo] = useState<"todos" | "retirados">("todos");
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["admin-productos", buscado, solo],
    queryFn: async (): Promise<Fila[]> => {
      if (!supabase) return [];
      let q = supabase.from("products").select("id,name,price,status,admin_hidden,admin_hidden_reason,stores(name),categories(name)").neq("status", "eliminado");
      if (buscado) q = q.ilike("name", `%${buscado.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      if (solo === "retirados") q = q.eq("admin_hidden", true);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const resolver = useMutation({
    mutationFn: async (p: { fila: Fila; retirar: boolean }) => {
      if (!supabase) throw new Error("Sin conexión");
      const motivo = (motivos[p.fila.id] ?? "").trim();
      if (p.retirar && motivo.length < 5) throw new Error("Escribe el motivo del retiro (mínimo 5 caracteres).");
      const r = await supabase.from("products").update({ admin_hidden: p.retirar, admin_hidden_reason: p.retirar ? motivo : null }).eq("id", p.fila.id).select("id");
      if (r.error || !r.data?.length) throw new Error("No se pudo guardar el cambio.");
      await supabase.rpc("registrar_auditoria", { p_action: p.retirar ? "producto_retirado" : "producto_restituido", p_entity: "products", p_entity_id: p.fila.id, p_metadata: p.retirar ? { motivo } : {} });
    },
    onSuccess: () => { setMensaje("Listo, el cambio quedó guardado."); void cliente.invalidateQueries({ queryKey: ["admin-productos"] }); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  function buscar(e: FormEvent) { e.preventDefault(); setBuscado(texto.trim()); }

  return (
    <div className="space-y-4">
      <form onSubmit={buscar} className="grid gap-3 rounded-xl border border-borde bg-white p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <Campo etiqueta="Buscar producto" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Campo etiqueta="Mostrar" id="admin-prod-solo">
          <select id="admin-prod-solo" className={estiloInput} value={solo} onChange={(e) => setSolo(e.target.value as typeof solo)}>
            <option value="todos">Todos</option>
            <option value="retirados">Solo retirados</option>
          </select>
        </Campo>
        <Boton type="submit" variante="secundario">Buscar</Boton>
      </form>
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudo cargar la lista.</p>}
      {lista.data?.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">No hay productos con ese criterio.</p>}
      <ul className="space-y-3">
        {lista.data?.map((f) => (
          <li key={f.id} className="space-y-3 rounded-xl border border-borde bg-white p-4">
            <div>
              <p className="font-display text-lg font-bold"><Link to={`/productos/${f.id}`} className="hover:underline">{f.name}</Link></p>
              <p className="text-sm text-suave">{soles(f.price)} · {f.stores?.name} · {f.categories?.name} · {f.status === "activo" ? "Publicado" : "Oculto por la tienda"}</p>
              {f.admin_hidden && <p className="text-sm font-semibold text-error">Retirado: {f.admin_hidden_reason}</p>}
            </div>
            <div>
              <label htmlFor={`motivo-p-${f.id}`} className="block text-sm font-bold">Motivo del retiro</label>
              <input id={`motivo-p-${f.id}`} className={estiloInput} value={motivos[f.id] ?? ""} onChange={(e) => setMotivos({ ...motivos, [f.id]: e.target.value })} />
            </div>
            <div className="flex gap-2">
              {f.admin_hidden
                ? <Boton variante="secundario" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, retirar: false })}>Restituir</Boton>
                : <Boton variante="contorno" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, retirar: true })}>Retirar del catálogo</Boton>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
