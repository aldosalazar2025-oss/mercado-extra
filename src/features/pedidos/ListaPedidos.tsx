import { Link, useSearchParams } from "react-router-dom";
import { clasesBoton } from "@/components/Boton";
import { soles } from "@/lib/format";
import SelectorTiendaVendedor from "@/features/vendedor/SelectorTiendaVendedor";
import { useMisTiendas, usePermisosPorTienda } from "@/features/tiendas/hooks";
import { usePedidos } from "./hooks";
import { etiquetaEstado, rutaPedido, type Pedido } from "./tipos";

type Rol = "comprador" | "vendedor";

function Tarjeta({ p, rol }: { p: Pedido; rol: Rol }) {
  const otro = rol === "comprador" ? p.tienda : p.comprador || "Comprador";
  const color = p.estado === "completada" || p.estado === "entregado" ? "bg-hoja text-pino" : p.estado === "cancelada" ? "bg-borde text-suave" : "bg-maiz-suave text-tinta";
  const necesitaFotos = rol === "vendedor" && p.modo === "domicilio" && (p.estado === "compra_coordinada" || p.estado === "en_preparacion");
  return (
    <li className="space-y-2 rounded-xl border border-borde bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold">{p.solicitud}</p>
          <p className="text-sm text-suave">{rol === "comprador" ? "Tienda" : "Comprador"}: {otro} · {p.modo === "domicilio" ? "Entrega a domicilio" : "Recojo en tienda"}</p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-xl font-extrabold text-pino">{soles(p.precio)}</p>
          <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-bold ${color}`}>{etiquetaEstado(p.estado, p.modo)}</span>
        </div>
      </div>
      {necesitaFotos && <p className="text-sm font-semibold">Fotos obligatorias: {p.fotos_obligatorias} de 4</p>}
      {rol === "comprador" && (p.estado === "enviado_o_listo" || p.estado === "pendiente_confirmacion") && <p className="rounded-lg bg-maiz-suave p-2 text-sm font-semibold">Tu código de entrega está listo: ábrelo para verlo.</p>}
      <Link to={rutaPedido(rol, p.order_id)} className={clasesBoton("contorno")}>Ver pedido</Link>
    </li>
  );
}

export default function ListaPedidos({ rol, soloEvidencias = false }: { rol: Rol; soloEvidencias?: boolean }) {
  const { data, isLoading, error } = usePedidos();
  const [parametros, setParametros] = useSearchParams();
  const filtroTienda = rol === "vendedor" ? parametros.get("tienda") : null;
  const tiendas = useMisTiendas(rol === "vendedor");
  const permisos = usePermisosPorTienda(rol === "vendedor");
  const disponibles = (tiendas.data ?? []).filter((t) => permisos.data?.get(t.id)?.has("gestionar_pedidos"));
  const estadoCompra = rol === "comprador" ? parametros.get("estado") ?? "" : "";
  const coincideEstado = (p: Pedido) => {
    if (estadoCompra === "en-curso") return p.estado !== "completada" && p.estado !== "cancelada";
    if (estadoCompra === "completada" || estadoCompra === "cancelada") return p.estado === estadoCompra;
    return true;
  };
  const lista = (data ?? []).filter((p) => p.mi_rol === rol && coincideEstado(p) && (!filtroTienda || p.store_id === filtroTienda)
    && (!soloEvidencias || p.estado === "compra_coordinada" || p.estado === "en_preparacion"));
  return (
    <div className="space-y-4">
      {rol === "comprador" && <label className="block max-w-xs font-bold">Estado de la compra
        <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3"
          value={estadoCompra} onChange={(e) => setParametros(e.target.value ? { estado: e.target.value } : {})}>
          <option value="">Todas las compras</option>
          <option value="en-curso">En curso</option>
          <option value="completada">Completadas</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </label>}
      {rol === "vendedor" && <SelectorTiendaVendedor tiendas={disponibles} />}
      {rol === "vendedor" && (tiendas.isError || permisos.isError) && <p role="alert" className="text-error">No se pudo cargar el filtro por tienda.</p>}
      {soloEvidencias && <p className="text-suave">Pedidos que todavía están en preparación. Antes de enviar un pedido a domicilio debes subir las 4 fotos obligatorias.</p>}
      {isLoading && <p className="text-suave">Cargando…</p>}
      {error && <p role="alert" className="text-error">No se pudieron cargar los pedidos.</p>}
      {!isLoading && !error && lista.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-suave">
          {estadoCompra ? "No hay compras con ese estado." : soloEvidencias ? "No tienes pedidos pendientes de evidencias." : rol === "comprador" ? "Aún no tienes compras. Cuando elijas una oferta aparecerá aquí." : "Aún no tienes pedidos. Aparecen cuando un comprador elige tu oferta."}
        </p>
      )}
      <ul className="space-y-3">{lista.map((p) => <Tarjeta key={p.order_id} p={p} rol={rol} />)}</ul>
    </div>
  );
}
