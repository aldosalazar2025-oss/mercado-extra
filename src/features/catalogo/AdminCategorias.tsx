import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo from "@/components/Campo";
import FiltroEstado from "@/components/FiltroEstado";
import { EliminarRegistros, useAccionesPapelera } from "@/features/admin/PapeleraAdmin";
import { slug } from "@/panels/config";
import { supabase } from "@/lib/supabase";
import type { Categoria } from "./tipos";

export default function AdminCategorias() {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<{ id: string; nombre: string } | null>(null);

  const lista = useQuery({
    queryKey: ["admin-categorias"],
    queryFn: async (): Promise<Categoria[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase.from("categories").select("id,name,slug,active").is("admin_archived_at", null).order("name");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });
  const visibles = lista.data?.filter((categoria) => !estado || categoria.active === (estado === "activa"));
  const acciones = useAccionesPapelera("categories", visibles?.filter((categoria) => !categoria.active).map((categoria) => categoria.id) ?? []);
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
    onSuccess: (_data, cambio) => {
      if (cambio.campos.name !== undefined) setEdicion(null);
      setMensaje("Cambio guardado.");
      refrescar();
    },
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
      {lista.isError && <p role="alert" className="text-error">No se pudieron cargar las categorías.</p>}
      <FiltroEstado estados={["activa", "desactivada"]} valor={estado} cambiar={setEstado} />
      {visibles?.length === 0 && <p className="text-sm text-suave">No hay categorías para este filtro.</p>}
      <ul className="space-y-2">
        {visibles?.map((c) => (
          <li key={c.id} className="space-y-3 rounded-xl border border-borde bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="break-words font-bold text-pino">{c.name}</h2>
                <span className={`text-sm font-semibold ${c.active ? "text-emerald-800" : "text-suave"}`}>{c.active ? "Activa" : "Desactivada"}</span>
              </div>
              {acciones?.get(c.id) === "eliminar" && <EliminarRegistros tabla="categories" ids={[c.id]} />}
            </div>
            {edicion?.id === c.id ? <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
              e.preventDefault();
              const editado = edicion.nombre.trim();
              if (editado.length >= 2) cambiar.mutate({ id: c.id, campos: { name: editado } });
            }}>
              <Campo etiqueta="Nombre de la categoría" value={edicion.nombre} required minLength={2} maxLength={80}
                onChange={(e) => setEdicion({ id: c.id, nombre: e.target.value })} />
              <Boton type="submit" disabled={cambiar.isPending || edicion.nombre.trim().length < 2}>Guardar</Boton>
              <Boton variante="contorno" disabled={cambiar.isPending} onClick={() => setEdicion(null)}>Cancelar</Boton>
            </form> : <div className="flex flex-wrap gap-2">
              <Boton variante="contorno" disabled={cambiar.isPending} onClick={() => setEdicion({ id: c.id, nombre: c.name })}>Editar</Boton>
              <Boton variante="contorno" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: c.id, campos: { active: !c.active } })}>{c.active ? "Desactivar" : "Activar"}</Boton>
            </div>}
          </li>
        ))}
      </ul>
      <p className="text-sm text-suave">Para eliminar una categoría, desactívala primero. Puedes recuperarla desde Auditoría → Papelera.</p>
    </div>
  );
}
