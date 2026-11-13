import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo from "@/components/Campo";
import { slug } from "@/panels/config";
import { supabase } from "@/lib/supabase";
import type { Categoria } from "./tipos";

export default function AdminCategorias() {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["admin-categorias"],
    queryFn: async (): Promise<Categoria[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("categories").select("id,name,slug,active").order("name");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });
  const refrescar = () => { void cliente.invalidateQueries({ queryKey: ["admin-categorias"] }); void cliente.invalidateQueries({ queryKey: ["categorias"] }); };

  const crear = useMutation({
    mutationFn: async (e: FormEvent) => {
      e.preventDefault();
      if (!supabase) throw new Error("Sin conexión");
      const n = nombre.trim();
      if (n.length < 2) throw new Error("Escribe el nombre de la categoría.");
      const r = await supabase.from("categories").insert({ name: n, slug: slug(n) });
      if (r.error) throw new Error(r.error.code === "23505" ? "Ya existe una categoría con ese nombre." : "No se pudo crear la categoría.");
    },
    onSuccess: () => { setNombre(""); setMensaje("Categoría creada."); refrescar(); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });
  const cambiar = useMutation({
    mutationFn: async (p: { id: string; campos: Partial<Pick<Categoria, "name" | "active">> }) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.from("categories").update(p.campos).eq("id", p.id).select("id");
      if (r.error || !r.data?.length) throw new Error("No se pudo guardar el cambio.");
    },
    onSuccess: () => { setMensaje("Cambio guardado."); refrescar(); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => crear.mutate(e)} className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-white p-4" noValidate>
        <div className="min-w-[240px] flex-1"><Campo etiqueta="Nueva categoría" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <Boton type="submit" variante="primario" disabled={crear.isPending}>Crear</Boton>
      </form>
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      <ul className="space-y-2">
        {lista.data?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-white p-3">
            <input
              aria-label={`Nombre de la categoría ${c.name}`}
              className="min-h-11 min-w-[200px] flex-1 rounded-lg border border-borde px-3"
              defaultValue={c.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v.length >= 2 && v !== c.name) cambiar.mutate({ id: c.id, campos: { name: v } }); else e.target.value = c.name; }}
            />
            <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${c.active ? "bg-hoja text-pino" : "bg-borde text-suave"}`}>{c.active ? "Activa" : "Desactivada"}</span>
            <Boton variante="contorno" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: c.id, campos: { active: !c.active } })}>{c.active ? "Desactivar" : "Activar"}</Boton>
          </li>
        ))}
      </ul>
      <p className="text-sm text-suave">Desactivar una categoría la oculta de los filtros y formularios; los productos existentes no se borran.</p>
    </div>
  );
}
