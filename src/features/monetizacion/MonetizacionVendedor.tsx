import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { estiloInput } from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import { accion, useCasosMutation } from "@/features/reclamos/casos";
import { useMisTiendas } from "@/features/tiendas/hooks";
import { conexion } from "./datos";
import { SolicitarPlan } from "./Planes";
import SolicitudesComerciales from "./SolicitudesComerciales";

function SolicitarPromocion({ tienda }: { tienda: string }) {
  const { session } = useAuth();
  const [objetivo, setObjetivo] = useState("");
  const [dias, setDias] = useState("7");
  const productos = useQuery({
    queryKey: ["monetizacion", session?.user.id, "productos", tienda],
    queryFn: async () => {
      const { data, error } = await conexion().from("products").select("id,name").eq("store_id", tienda)
        .eq("status", "activo").eq("admin_hidden", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const solicitar = useCasosMutation(async () => {
    await accion("solicitar_promocion", { p_tienda: tienda, p_producto: objetivo || null, p_dias: Number(dias) });
    setObjetivo("");
  });

  return (
    <form className="space-y-3 rounded-xl border border-borde bg-white p-4" onSubmit={(e) => {
      e.preventDefault();
      solicitar.mutate();
    }}>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={solicitar.isPending}>
        <label className="text-sm font-bold">Qué quieres destacar
          <select className={`mt-1 ${estiloInput}`} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
            <option value="">La tienda</option>
            {productos.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold">Duración
          <select className={`mt-1 ${estiloInput}`} value={dias} onChange={(e) => setDias(e.target.value)}>
            {[7, 14, 30].map((valor) => <option key={valor} value={valor}>{valor} días</option>)}
          </select>
        </label>
      </fieldset>
      {productos.isError && <p role="alert" className="text-error">No se pudieron cargar los productos.</p>}
      <p className="text-sm text-suave">Puedes solicitar una promoción a la vez sin plan. La duración empieza cuando administración la activa.</p>
      <Boton type="submit" disabled={solicitar.isPending}>Solicitar promoción</Boton>
      {solicitar.isError && <p role="alert" className="text-error">{solicitar.error.message}</p>}
      {solicitar.isSuccess && <p role="status" className="text-pino">Promoción enviada para revisión.</p>}
    </form>
  );
}

export default function MonetizacionVendedor() {
  const { session } = useAuth();
  const tiendas = useMisTiendas();
  const propias = tiendas.data?.filter((t) => t.owner_id === session?.user.id) ?? [];
  const [elegida, setElegida] = useState("");
  const [seccion, setSeccion] = useState<"promocion" | "plan">("promocion");
  const tienda = propias.find((t) => t.id === elegida) ?? propias[0];

  if (tiendas.isLoading) return <p className="text-suave">Cargando tiendas…</p>;
  if (tiendas.isError) return <p role="alert" className="text-error">No se pudieron cargar tus tiendas.</p>;
  if (!tienda) return <p className="text-suave">Esta sección está disponible para propietarios de tiendas.</p>;
  return (
    <div className="space-y-4">
      <label className="block max-w-md text-sm font-bold">Tienda
        <select className={`mt-1 ${estiloInput}`} value={tienda.id} onChange={(e) => setElegida(e.target.value)}>
          {propias.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div aria-label="Opciones comerciales" className="flex flex-wrap gap-2">
        <Boton aria-pressed={seccion === "promocion"} variante={seccion === "promocion" ? "secundario" : "contorno"} onClick={() => setSeccion("promocion")}>Promociones</Boton>
        <Boton aria-pressed={seccion === "plan"} variante={seccion === "plan" ? "secundario" : "contorno"} onClick={() => setSeccion("plan")}>Planes</Boton>
      </div>
      {tienda.status === "aprobada" ? (seccion === "plan" ? <SolicitarPlan key={tienda.id} tienda={tienda.id} /> : <SolicitarPromocion key={tienda.id} tienda={tienda.id} />)
        : <p className="text-sm text-suave">La tienda debe estar aprobada para enviar solicitudes.</p>}
      <h2 className="font-display text-lg font-bold text-pino">{seccion === "plan" ? "Historial de planes" : "Historial de promociones"}</h2>
      <SolicitudesComerciales key={tienda.id + seccion} tienda={tienda.id} tipo={seccion} />
    </div>
  );
}
