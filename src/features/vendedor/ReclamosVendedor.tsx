import { useSearchParams } from "react-router-dom";
import { ListaCasos } from "@/features/reclamos/ListaCasos";
import { useMisTiendas, usePermisosPorTienda } from "@/features/tiendas/hooks";
import SelectorTiendaVendedor from "./SelectorTiendaVendedor";

export default function ReclamosVendedor() {
  const tiendas = useMisTiendas();
  const permisos = usePermisosPorTienda();
  const [parametros] = useSearchParams();
  const tienda = parametros.get("tienda");
  const disponibles = (tiendas.data ?? []).filter((fila) => permisos.data?.get(fila.id)?.has("gestionar_pedidos"));

  if (tiendas.isError || permisos.isError) return <p role="alert" className="text-error">No se pudieron cargar las tiendas o sus permisos.</p>;
  if (tiendas.isLoading || permisos.isLoading) return <p className="text-suave">Cargando tiendas…</p>;

  const ids = disponibles.filter((fila) => !tienda || fila.id === tienda).map((fila) => fila.id);
  return (
    <div className="space-y-4">
      <SelectorTiendaVendedor tiendas={disponibles} />
      {ids.length > 0 ? <ListaCasos clase="reclamo" rol="vendedor" tiendas={ids} />
        : <p className="text-suave">Elige una tienda donde puedas gestionar pedidos.</p>}
    </div>
  );
}
