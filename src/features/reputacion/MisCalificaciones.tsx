import ResumenReputacion from "./ResumenReputacion";
import { useMisTiendas, usePermisosPorTienda } from "@/features/tiendas/hooks";
import EstrellasCalificacion from "./EstrellasCalificacion";
import { useState } from "react";
import { AccionHistorial, SeleccionHistorial, useHistorialPersonal } from "@/features/comprador/HistorialPersonal";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

function Denunciar({ id, uid }: { id: string; uid: string }) {
  const cliente = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const enviar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { error } = await supabase.from("rating_reports").insert({
        rating_id: id, reporter_id: uid, reason: motivo.trim(),
      });
      if (error && error.code !== "23505") throw new Error("No se pudo enviar la denuncia. Inténtalo de nuevo.");
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["calificaciones", uid, "historial"] }),
  });

  if (enviar.isSuccess) return <p role="status" className="text-sm text-suave">Denuncia registrada.</p>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-bold text-mercado">Denunciar calificación</summary>
      <form className="mt-2 space-y-2" onSubmit={(event) => {
        event.preventDefault();
        if (motivo.trim().length >= 5) enviar.mutate();
      }}>
        <label className="block font-bold">
          Motivo
          <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" value={motivo}
            rows={3} minLength={5} maxLength={1000} required disabled={enviar.isPending}
            onChange={(event) => setMotivo(event.target.value)} />
        </label>
        {enviar.isError && <p role="alert" className="text-error">{enviar.error.message}</p>}
        <Boton type="submit" variante="contorno" disabled={motivo.trim().length < 5 || enviar.isPending}>
          {enviar.isPending ? "Enviando…" : "Enviar denuncia"}
        </Boton>
      </form>
    </details>
  );
}

export default function MisCalificaciones({ rol }: { rol: "comprador" | "vendedor" }) {
  const historial = useHistorialPersonal("calificaciones", rol === "comprador");
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const tiendas = useMisTiendas(rol === "vendedor");
  const permisos = usePermisosPorTienda(rol === "vendedor");
  const [tiendaElegida, setTiendaElegida] = useState("");
  const [vista, setVista] = useState<"recibidas" | "enviadas">("recibidas");
  const [estrellas, setEstrellas] = useState<number | null>(null);
  const disponibles = (tiendas.data ?? []).filter((t) => permisos.data?.get(t.id)?.has("gestionar_pedidos"));
  const tienda = disponibles.find((t) => t.id === tiendaElegida) ?? disponibles[0];
  const consulta = useInfiniteQuery({
    queryKey: ["calificaciones", uid, "historial", rol, tienda?.id, vista, estrellas],
    enabled: Boolean(uid && supabase && (rol === "comprador" || tienda)),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!supabase) throw new Error("Sin conexión");
      const campos = "id,rater_role,rated_id,score,comment,status,created_at,rating_reports(id,status)" as const;
      const raterRole = vista === "enviadas" ? rol : rol === "comprador" ? "vendedor" : "comprador";
      const base = rol === "vendedor" && tienda
        ? supabase.from("ratings").select(`${campos},orders!inner(store_id)`).eq("orders.store_id", tienda.id)
        : supabase.from("ratings").select(campos).eq(vista === "enviadas" ? "rater_id" : "rated_id", uid);
      const filtro = estrellas === null ? base : base.eq("score", estrellas).eq("status", "visible");
      const { data, error } = await filtro.eq("rater_role", raterRole)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(pageParam, pageParam + 20);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (pagina, _, offset) => pagina.length > 20 ? offset + 20 : undefined,
  });
  function cambiarVista(siguiente: "recibidas" | "enviadas") {
    setVista(siguiente);
    setEstrellas(null);
  }

  if (!supabase) return <p className="text-suave">Conecta Supabase para consultar tus calificaciones.</p>;
  if (rol === "vendedor" && (tiendas.isError || permisos.isError)) return <p role="alert" className="text-error">No se pudieron cargar las tiendas.</p>;
  if (rol === "vendedor" && (tiendas.isLoading || permisos.isLoading)) return <p className="text-suave">Cargando tiendas…</p>;
  if (rol === "vendedor" && !tienda) return <p className="text-suave">Necesitas una tienda con permiso para gestionar pedidos.</p>;
  const esRecibida = (fila: { rater_role: string }) => fila.rater_role !== rol;
  const visibles = (consulta.data?.pages.flatMap((pagina) => pagina.slice(0, 20)) ?? [])
    .filter((fila) => historial.visible(fila.id));
  return (
    <div className="space-y-4">
      {rol === "vendedor" && disponibles.length > 1 && <label className="block max-w-sm text-sm font-bold">
        Tienda
        <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3"
          value={tienda?.id} onChange={(e) => setTiendaElegida(e.target.value)}>
          {disponibles.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>}
      <section className="space-y-2 rounded-xl border border-borde bg-white p-5">
        <h2 className="font-display text-lg font-bold text-pino">Calificación promedio{tienda ? ` de ${tienda.name}` : ""}</h2>
        <ResumenReputacion mostrarDistribucion id={rol === "comprador" ? uid : tienda?.id ?? ""} tipo={rol === "comprador" ? "comprador" : "tienda"} estrellas={estrellas}
          alFiltrar={(puntuacion) => { setVista("recibidas"); setEstrellas(puntuacion); }} />
      </section>
      <div className="flex flex-wrap gap-2">
        <Boton variante={vista === "recibidas" ? "primario" : "contorno"} aria-pressed={vista === "recibidas"} onClick={() => cambiarVista("recibidas")}>Recibidas</Boton>
        <Boton variante={vista === "enviadas" ? "primario" : "contorno"} aria-pressed={vista === "enviadas"} onClick={() => cambiarVista("enviadas")}>Enviadas</Boton>
      </div>
      {estrellas !== null && <div className="flex flex-wrap items-center gap-3">
        <p aria-live="polite" className="font-semibold">Reseñas de {estrellas} {estrellas === 1 ? "estrella" : "estrellas"}</p>
        <Boton variante="contorno" onClick={() => setEstrellas(null)}>Quitar filtro</Boton>
      </div>}
      {consulta.isPending && <p className="text-suave">Cargando calificaciones…</p>}
      {consulta.isError && !consulta.isFetchNextPageError && <p role="alert" className="text-error">No se pudieron cargar las calificaciones.</p>}
      {consulta.isSuccess && !visibles.length && !consulta.hasNextPage && <p className="rounded-xl bg-white p-5 text-suave">{estrellas === null ? `No hay calificaciones ${vista} para mostrar.` : "No hay reseñas con esta puntuación."}</p>}
    <SeleccionHistorial historial={historial} ids={visibles.map((fila) => fila.id)} />
    <ul className="space-y-3">
      {visibles.map((fila) => {
        const recibida = esRecibida(fila);
        const denuncia = fila.rating_reports[0];
        return (
          <li key={fila.id} className="space-y-2 rounded-xl border border-borde bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-2 font-bold text-pino"><EstrellasCalificacion puntuacion={fila.score} /> {recibida ? "Recibida" : "Enviada"}</p>
              <AccionHistorial historial={historial} id={fila.id} />
            </div>
            <p className="text-sm text-suave">{new Date(fila.created_at).toLocaleDateString("es-PE")}{fila.status === "oculta" && " · Oculta"}</p>
            {(fila.comment || estrellas !== null) && <p className="whitespace-pre-wrap break-words">{fila.comment || "Sin comentario."}</p>}
            {recibida && (denuncia
              ? <p className="text-sm text-suave">Denuncia {denuncia.status}</p>
              : fila.status !== "oculta" && fila.rated_id === uid && <Denunciar id={fila.id} uid={uid} />)}
          </li>
        );
      })}
    </ul>
    {consulta.isFetchNextPageError && <p role="alert" className="text-sm text-error">No se pudieron cargar más calificaciones.</p>}
    {consulta.hasNextPage && <Boton variante="contorno" disabled={consulta.isFetchingNextPage}
      onClick={() => void consulta.fetchNextPage()}>{consulta.isFetchingNextPage ? "Cargando…" : "Ver más reseñas"}</Boton>}
    </div>
  );
}
