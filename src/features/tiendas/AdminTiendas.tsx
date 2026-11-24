import TachoBaja from "@/features/admin/TachoBaja";
import PromedioListado, { usePromediosListado } from "@/features/admin/PromedioListado";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import FiltroEstado from "@/components/FiltroEstado";
import { estiloInput } from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import Insignia from "./Insignia";
import { COLUMNAS_TIENDA, type EstadoTienda, type Tienda } from "./tipos";

type Fila = Tienda & { profiles: { full_name: string; email: string | null } | null };

export default function AdminTiendas() {
  const { session } = useAuth();
  const cliente = useQueryClient();
  const [filtro, setFiltro] = useState<EstadoTienda | "">("");
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["admin-tiendas", session?.user.id, filtro],
    queryFn: async () => {
      if (!supabase) return { filas: [] as Fila[], identidad: new Map<string, string>() };
      const consulta = supabase.from("stores").select(`${COLUMNAS_TIENDA},profiles:owner_id(full_name,email)`).is("admin_baja_at", null);
      if (filtro) consulta.eq("status", filtro);
      const { data, error } = await consulta.order("created_at");
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

  const promedios = usePromediosListado("tiendas", lista.data?.filas.map((f) => f.id) ?? []);

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
      <FiltroEstado<EstadoTienda> estados={["pendiente", "aprobada", "rechazada", "suspendida", "inactiva"]}
        valor={filtro} cambiar={setFiltro} />
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudo cargar la lista.</p>}
      {lista.data?.filas.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">No hay tiendas en este estado.</p>}
      <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-white">
        {lista.data?.filas.map((f) => (
          <li key={f.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 break-words font-display text-lg font-bold text-pino">{f.name}</h2>
              <TachoBaja id={f.id} tipo="tienda" nombre={f.name} />
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0"><dt className="font-bold text-pino">Propietario</dt>
                <dd className="break-words">{f.profiles?.full_name || "Sin nombre"}{f.profiles?.email && <span className="block text-suave">{f.profiles.email}</span>}</dd></div>
              <div className="min-w-0"><dt className="font-bold text-pino">RUC y contacto</dt>
                <dd className="break-words">{f.business_id || "Sin RUC"}{f.phone && <span className="block text-suave">{f.phone}</span>}</dd></div>
              <div><dt className="font-bold text-pino">Estado</dt><dd><Insignia estado={f.status} /></dd></div>
              <div><dt className="font-bold text-pino">Reputación de la tienda</dt>
                <dd><PromedioListado id={f.id} consulta={promedios} /></dd></div>
            </dl>
            <details className="space-y-3 rounded-lg border border-borde p-3">
              <summary className="cursor-pointer font-bold text-mercado">Ver detalles y gestionar tienda</summary>
              <p className="text-sm text-suave">{f.address ?? "Sin dirección"} · {textoIdentidad(lista.data?.identidad.get(f.owner_id))}</p>
              {f.description && <p className="text-sm">{f.description}</p>}
              {f.rejection_reason && <p className="text-sm">Motivo registrado: {f.rejection_reason}</p>}
            <div>
              <label htmlFor={`motivo-t-${f.id}`} className="block text-sm font-bold">Motivo (obligatorio para rechazar, bloquear)</label>
              <input id={`motivo-t-${f.id}`} className={estiloInput} value={motivos[f.id] ?? ""} onChange={(e) => setMotivos({ ...motivos, [f.id]: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(f.status === "pendiente" || f.status === "rechazada" || f.status === "suspendida" || f.status === "inactiva") && (
                <Boton variante="secundario" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, estado: "aprobada" })}>{f.status === "pendiente" ? "Aprobar" : "Reactivar"}</Boton>
              )}
              {f.status === "pendiente" && <Boton variante="contorno" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, estado: "rechazada" })}>Rechazar</Boton>}
              {f.status === "aprobada" && <Boton variante="contorno" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, estado: "suspendida" })}>Bloquear</Boton>}
            </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
