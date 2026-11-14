import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMisTiendas, usePermisosTienda } from "@/features/tiendas/hooks";
import FormularioOferta from "./FormularioOferta";

export default function OfertaEditor() {
  const { requestId } = useParams();
  const [params] = useSearchParams();
  const tiendaId = params.get("tienda") ?? undefined;
  const ir = useNavigate();
  const tiendas = useMisTiendas();
  const tienda = tiendas.data?.find((t) => t.id === tiendaId);
  const permisos = usePermisosTienda(tiendaId, tienda?.owner_id);
  const volver = <p><Link to="/vendedor/solicitudes-recibidas" className="font-bold text-mercado underline">← Solicitudes recibidas</Link></p>;

  if (tiendas.isLoading || permisos.isLoading) return <p className="text-suave">Cargando…</p>;
  if (!requestId || !tienda) return <div className="space-y-3">{volver}<p className="rounded-xl bg-white p-6 text-suave">No encontramos esa tienda entre las tuyas.</p></div>;
  if (!permisos.data?.permisos.has("enviar_ofertas")) return <div className="space-y-3">{volver}<p className="rounded-xl bg-white p-6 text-suave">No tienes permiso para enviar ofertas en esta tienda.</p></div>;
  return (
    <div className="space-y-4">
      {volver}
      <h2 className="font-display text-2xl font-extrabold">Oferta de {tienda.name}</h2>
      <FormularioOferta requestId={requestId} storeId={tienda.id} onEnviado={() => ir("/vendedor/mis-ofertas", { replace: true })} />
    </div>
  );
}
