import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { supabase } from "@/lib/supabase";
import Empleados from "./Empleados";
import FormularioTienda from "./FormularioTienda";
import Insignia from "./Insignia";
import { usePermisosTienda } from "./hooks";
import { COLUMNAS_TIENDA, type Tienda } from "./tipos";

export default function TiendaDetalle() {
  const { tiendaId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "empleados" ? "empleados" : "datos";
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ["tienda", tiendaId],
    enabled: Boolean(tiendaId && supabase),
    queryFn: async () => {
      if (!supabase || !tiendaId) return null;
      const t = await supabase.from("stores").select(COLUMNAS_TIENDA).eq("id", tiendaId).maybeSingle();
      if (t.error) throw t.error;
      if (!t.data) return null;
      const c = await supabase.from("store_categories").select("category_id").eq("store_id", tiendaId);
      return { tienda: t.data as Tienda, categorias: (c.data ?? []).map((x) => x.category_id as string) };
    },
  });
  const tienda = consulta.data?.tienda;
  const permisos = usePermisosTienda(tiendaId, tienda?.owner_id);
  const puedeEditar = permisos.data?.permisos.has("editar_tienda") ?? false;
  const puedeGestionar = permisos.data?.permisos.has("gestionar_empleados") ?? false;

  const cambiarEstado = useMutation({
    mutationFn: async (nuevo: "inactiva" | "pendiente") => {
      if (!supabase || !tiendaId) throw new Error("Sin conexión");
      const campos = nuevo === "pendiente" ? { status: nuevo, rejection_reason: null } : { status: nuevo };
      const r = await supabase.from("stores").update(campos).eq("id", tiendaId).select("id");
      if (r.error || !r.data || r.data.length === 0) throw new Error("No se pudo cambiar el estado de la tienda.");
    },
    onSuccess: () => { setMensaje("Estado actualizado."); void cliente.invalidateQueries({ queryKey: ["tienda", tiendaId] }); void cliente.invalidateQueries({ queryKey: ["mis-tiendas"] }); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  if (consulta.isLoading) return <p className="text-suave">Cargando…</p>;
  if (!tienda) return <p className="rounded-xl bg-white p-6 text-suave">No encontramos esa tienda o no tienes acceso a ella.</p>;

  return (
    <div className="space-y-4">
      <p><Link to="/vendedor/mis-tiendas" className="font-bold text-mercado underline">← Mis tiendas</Link></p>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-extrabold">{tienda.name}</h2>
        <Insignia estado={tienda.status} />
      </div>
      {tienda.status === "pendiente" && <p className="rounded-lg bg-maiz-suave p-3 text-sm">La administración está revisando tu tienda. Mientras tanto puedes completar tus datos. Recibirás solicitudes cuando sea aprobada.</p>}
      {(tienda.status === "rechazada" || tienda.status === "suspendida") && (
        <div role="alert" className="space-y-2 rounded-lg border border-error/40 bg-white p-3 text-sm">
          <p><strong>{tienda.status === "rechazada" ? "Tu tienda fue rechazada." : "Tu tienda está suspendida."}</strong> Motivo: {tienda.rejection_reason ?? "sin detalle"}.</p>
          {tienda.status === "rechazada" && puedeEditar && <Boton variante="secundario" onClick={() => cambiarEstado.mutate("pendiente")}>Ya corregí los datos, volver a enviar</Boton>}
        </div>
      )}
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}

      <div role="tablist" className="flex gap-2">
        {(["datos", "empleados"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setParams(t === "datos" ? {} : { tab: t })}
            className={`min-h-11 rounded-lg px-4 font-bold ${tab === t ? "bg-mercado text-white" : "bg-white text-tinta hover:bg-hoja"}`}>
            {t === "datos" ? "Datos de la tienda" : "Empleados y permisos"}
          </button>
        ))}
      </div>

      {tab === "datos" && (
        puedeEditar ? (
          <>
            <FormularioTienda inicial={tienda} categoriasIniciales={consulta.data?.categorias} onGuardado={() => setMensaje("Datos guardados.")} />
            {tienda.status === "aprobada" && (
              <Boton variante="contorno" onClick={() => { if (confirm("Una tienda inactiva deja de recibir solicitudes. ¿Continuar?")) cambiarEstado.mutate("inactiva"); }}>Desactivar tienda</Boton>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-white p-4 text-suave">No tienes permiso para editar los datos de esta tienda.</p>
        )
      )}
      {tab === "empleados" && <Empleados tiendaId={tienda.id} esPropietario={permisos.data?.esPropietario ?? false} puedeGestionar={puedeGestionar} />}
    </div>
  );
}
