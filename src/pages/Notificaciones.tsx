import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { useNotificaciones, type Notificacion } from "@/features/notificaciones/hooks";
import { supabase } from "@/lib/supabase";

function rutaDe(n: Notificacion): string | null {
  const rid = typeof n.payload.request_id === "string" ? n.payload.request_id : null;
  switch (n.type) {
    case "solicitud_nueva":
    case "solicitud_atendida":
      return "/vendedor/solicitudes-recibidas";
    case "solicitud_vencida":
      return "/comprador/mis-solicitudes";
    case "oferta_nueva":
    case "oferta_actualizada":
    case "propuesta_nueva":
      return rid ? `/comprador/mis-solicitudes/${rid}/ofertas` : "/comprador/mis-solicitudes";
    case "mensaje_nuevo": {
      const cid = typeof n.payload.conversation_id === "string" ? n.payload.conversation_id : null;
      const para = n.payload.para === "vendedor" ? "vendedor" : "comprador";
      return cid ? `/${para}/chat/${cid}` : `/${para}/chat`;
    }
    case "pedido_estado":
    case "codigo_entrega":
    case "entrega_confirmada": {
      if (n.payload.para === "admin" && typeof n.payload.claim_id === "string") return `/admin/reclamos?reclamo=${n.payload.claim_id}`;
      const oid = typeof n.payload.order_id === "string" ? n.payload.order_id : null;
      const para = n.payload.para === "vendedor" ? "vendedor" : "comprador";
      if (!oid) return para === "vendedor" ? "/vendedor/pedidos" : "/comprador/mis-compras";
      return para === "vendedor" ? `/vendedor/pedidos/${oid}` : `/comprador/mis-compras/${oid}`;
    }
    case "oferta_elegida":
    case "propuesta_respondida":
      return "/vendedor/mis-ofertas";
    default:
      return null;
  }
}

export default function Notificaciones() {
  const { session } = useAuth();
  const ir = useNavigate();
  const cliente = useQueryClient();
  const { data, isLoading, error } = useNotificaciones();
  const refrescar = () => void cliente.invalidateQueries({ queryKey: ["notificaciones"] });

  const marcar = useMutation({
    mutationFn: async (id: string | null) => {
      if (!supabase || !session) return;
      let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.user.id).is("read_at", null);
      if (id) q = q.eq("id", id);
      await q;
    },
    onSuccess: refrescar,
  });

  const vaciar = useMutation({
    mutationFn: async () => {
      if (!supabase || !session) throw new Error("No hay una sesión activa.");
      const { error: errorBorrado } = await supabase.rpc("vaciar_mis_notificaciones");
      if (errorBorrado) throw errorBorrado;
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ["notificaciones"] });
    },
  });

  function abrir(n: Notificacion) {
    if (!n.read_at) marcar.mutate(n.id);
    const ruta = rutaDe(n);
    if (ruta) ir(ruta);
  }

  const sinLeer = data?.filter((n) => !n.read_at).length ?? 0;

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold text-pino">Notificaciones</h1>
        <div className="flex flex-wrap items-center gap-2">
          {sinLeer > 0 && <Boton variante="contorno" onClick={() => marcar.mutate(null)} disabled={marcar.isPending || vaciar.isPending}>Marcar todas como leídas</Boton>}
          {Boolean(data?.length) && <button type="button" aria-label="Vaciar notificaciones" title="Vaciar notificaciones"
            className="inline-flex size-11 items-center justify-center rounded-lg text-error hover:bg-red-50 focus-visible:outline-2 disabled:opacity-40"
            disabled={vaciar.isPending || marcar.isPending}
            onClick={() => {
              if (confirm("¿Eliminar definitivamente todas las notificaciones de tu buzón? Esta acción no se puede deshacer.")) vaciar.mutate();
            }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" className="size-5">
              <path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 4v6m4-6v6" />
            </svg>
          </button>}
        </div>
      </div>
      {vaciar.isPending && <p role="status" className="text-sm text-suave">Vaciando notificaciones…</p>}
      {vaciar.isError && <p role="alert" className="text-error">No se pudo vaciar tu buzón. Inténtalo de nuevo.</p>}
      {isLoading && <p className="text-suave">Cargando…</p>}
      {error && <p role="alert" className="text-error">No se pudieron cargar tus notificaciones.</p>}
      {data?.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">No tienes notificaciones todavía. Te avisaremos cuando haya novedades.</p>}
      <ul className="space-y-2">
        {data?.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => abrir(n)}
              className={`w-full rounded-xl border p-4 text-left ${n.read_at ? "border-borde bg-white" : "border-maiz bg-maiz-suave"}`}
            >
              <p className="font-bold">{n.title}</p>
              {n.body && <p className="text-sm">{n.body}</p>}
              <p className="mt-1 text-xs text-suave">{new Date(n.created_at).toLocaleString("es-PE")}{n.read_at ? "" : " · Nueva"}</p>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
