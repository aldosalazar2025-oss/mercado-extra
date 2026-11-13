import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { estiloInput } from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import Insignia from "./Insignia";
import { COLUMNAS_TIENDA, type EstadoTienda, type Tienda } from "./tipos";

type Fila = Tienda & { profiles: { full_name: string; email: string | null } | null };

export default function AdminTiendas() {
  const { session } = useAuth();
  const cliente = useQueryClient();
  const [filtro, setFiltro] = useState<EstadoTienda>("pendiente");
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["admin-tiendas", filtro],
    queryFn: async () => {
      if (!supabase) return { filas: [] as Fila[], identidad: new Map<string, string>() };
      const { data, error } = await supabase.from("stores").select(`${COLUMNAS_TIENDA},profiles:owner_id(full_name,email)`).eq("status", filtro).order("created_at");
      if (error) throw error;
      const filas = (data ?? []) as unknown as Fila[];
      const identidad = new Map<string, string>();
      const ids = [...new Set(filas.map((f) => f.owner_id))];
      if (ids.length > 0) {
        const v = await supabase.from("identity_verifications").select("user_id,status").in("user_id", ids);
        (v.data ?? []).forEach((x) => identidad.set(x.user_id as string, x.status as string));
      }
      return { filas, identidad };
    },
  });

  const resolver = useMutation({
    mutationFn: async (p: { fila: Fila; estado: EstadoTienda }) => {
      if (!supabase || !session) throw new Error("Sin sesión");
      const motivo = (motivos[p.fila.id] ?? "").trim();
      const necesitaMotivo = p.estado === "rechazada" || p.estado === "suspendida";
      if (necesitaMotivo && motivo.length < 5) throw new Error("Escribe el motivo (mínimo 5 caracteres).");
      const r = await supabase.from("stores").update({ status: p.estado, rejection_reason: necesitaMotivo ? motivo : null }).eq("id", p.fila.id).select("id");
      if (r.error || !r.data || r.data.length === 0) throw new Error("No se pudo guardar el cambio.");
      await supabase.rpc("registrar_auditoria", {
        p_action: `tienda_${p.estado}`, p_entity: "stores", p_entity_id: p.fila.id, p_metadata: necesitaMotivo ? { motivo } : {},
      });
    },
    onSuccess: () => { setMensaje("Listo, el cambio quedó guardado."); void cliente.invalidateQueries({ queryKey: ["admin-tiendas"] }); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  const textoIdentidad = (id: string | undefined) =>
    id === "verificado" ? "Identidad del dueño: verificada" : id === "pendiente" ? "Identidad del dueño: pendiente" : id === "rechazado" ? "Identidad del dueño: rechazada" : "Identidad del dueño: sin registro";

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <label htmlFor="filtro-tiendas" className="block font-bold">Estado</label>
        <select id="filtro-tiendas" className={estiloInput} value={filtro} onChange={(e) => setFiltro(e.target.value as EstadoTienda)}>
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="suspendida">Suspendidas</option>
          <option value="inactiva">Inactivas</option>
        </select>
      </div>
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudo cargar la lista.</p>}
      {lista.data?.filas.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">No hay tiendas en este estado.</p>}
      <ul className="space-y-3">
        {lista.data?.filas.map((f) => (
          <li key={f.id} className="space-y-3 rounded-xl border border-borde bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="font-display text-lg font-bold">{f.name}</p>
                <Insignia estado={f.status} />
                <p className="text-sm text-suave">{f.address ?? "Sin dirección"}{f.phone ? ` · ${f.phone}` : ""}{f.business_id ? ` · RUC ${f.business_id}` : ""}</p>
                <p className="text-sm text-suave">Dueño: {f.profiles?.full_name || "sin nombre"} ({f.profiles?.email}) · {textoIdentidad(lista.data?.identidad.get(f.owner_id))}</p>
                {f.description && <p className="text-sm">{f.description}</p>}
                {f.rejection_reason && <p className="text-sm">Motivo registrado: {f.rejection_reason}</p>}
              </div>
            </div>
            <div>
              <label htmlFor={`motivo-t-${f.id}`} className="block text-sm font-bold">Motivo (obligatorio para rechazar o suspender)</label>
              <input id={`motivo-t-${f.id}`} className={estiloInput} value={motivos[f.id] ?? ""} onChange={(e) => setMotivos({ ...motivos, [f.id]: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(f.status === "pendiente" || f.status === "rechazada" || f.status === "suspendida" || f.status === "inactiva") && (
                <Boton variante="secundario" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, estado: "aprobada" })}>{f.status === "pendiente" ? "Aprobar" : "Reactivar"}</Boton>
              )}
              {f.status === "pendiente" && <Boton variante="contorno" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, estado: "rechazada" })}>Rechazar</Boton>}
              {f.status === "aprobada" && <Boton variante="contorno" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, estado: "suspendida" })}>Suspender</Boton>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
