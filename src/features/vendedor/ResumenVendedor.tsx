import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clasesBoton } from "@/components/Boton";
import { estiloInput } from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import Insignia from "@/features/tiendas/Insignia";
import type { Tienda } from "@/features/tiendas/tipos";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type Resumen = {
  tienda_id: string;
  nombre: string;
  estado: Tienda["status"];
  productos: number | null;
  solicitudes: number | null;
  ofertas: number | null;
  pedidos: number | null;
  reclamos: number | null;
  pedidos_periodo: number | null;
  completados: number | null;
  cancelados: number | null;
  importe_acordado: number | null;
  calificaciones: number | null;
  promedio: number | null;
};

const indicadores = [
  ["solicitudes", "Solicitudes vigentes", "solicitudes-recibidas"],
  ["ofertas", "Ofertas en espera", "mis-ofertas"],
  ["pedidos", "Pedidos abiertos", "pedidos"],
  ["reclamos", "Reclamos abiertos", "reclamos"],
  ["productos", "Productos en catálogo propio", "mis-productos"],
] as const;

function format(cantidad: number | null) {
  return cantidad === null ? "—" : cantidad.toLocaleString("es-PE");
}

function Estadisticas({ tienda }: { tienda: Resumen }) {
  const metricas = [
    ["Pedidos creados", format(tienda.pedidos_periodo)],
    ["Completados", format(tienda.completados)],
    ["Cancelados", format(tienda.cancelados)],
    ["Importe acordado de pedidos completados", soles(Number(tienda.importe_acordado))],
    ["Calificaciones recibidas", format(tienda.calificaciones)],
    ["Promedio de calificaciones", tienda.promedio === null ? "Sin calificaciones" : `${format(tienda.promedio)} de 5`],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metricas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="rounded-xl border border-borde bg-white p-4">
          <dt className="text-sm font-bold text-suave">{etiqueta}</dt>
          <dd className="mt-2 text-2xl font-extrabold text-pino">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ResumenVendedor({ estadisticas = false }: { estadisticas?: boolean }) {
  const { session } = useAuth();
  const [elegida, setElegida] = useState("");
  const [dias, setDias] = useState("30");
  const periodo = estadisticas && dias ? Number(dias) : null;
  const consulta = useQuery({
    queryKey: ["panel-vendedor", session?.user.id, periodo],
    enabled: Boolean(session && supabase),
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.rpc("panel_vendedor", { p_dias: periodo });
      if (error) throw error;
      return (data ?? []) as Resumen[];
    },
  });
  const tiendas = consulta.data?.filter((fila) => !estadisticas || fila.pedidos_periodo !== null) ?? [];
  const tienda = tiendas.find((fila) => fila.tienda_id === elegida) ?? tiendas[0];

  return (
    <div className="space-y-4">
      {estadisticas && <label className="block max-w-xs font-bold">Periodo
        <select className={`mt-1 ${estiloInput}`} value={dias} onChange={(e) => setDias(e.target.value)}>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
          <option value="">Todo el historial</option>
        </select>
      </label>}
      {consulta.isPending && <p className="text-suave">Cargando…</p>}
      {consulta.isError && <p role="alert" className="text-error">No se pudieron cargar los datos del panel.</p>}
      {consulta.isSuccess && !tienda && <div className="space-y-3 rounded-xl border border-borde bg-white p-4">
        <p className="text-suave">{estadisticas ? "No tienes permiso para ver estadísticas de una tienda." : "Aún no tienes tiendas vinculadas a tu cuenta."}</p>
        {!estadisticas && <Link to="/vendedor/mis-tiendas/nueva" className={clasesBoton("primario")}>Registrar una tienda</Link>}
      </div>}
      {tienda && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-white p-4">
            <label className="w-full max-w-xs font-bold">Tienda
              <select className={`mt-1 ${estiloInput}`} value={tienda.tienda_id} onChange={(e) => setElegida(e.target.value)}>
                {tiendas.map((fila) => <option key={fila.tienda_id} value={fila.tienda_id}>{fila.nombre}</option>)}
              </select>
            </label>
            <Insignia estado={tienda.estado} />
            {!estadisticas && <Link to={`/vendedor/mis-tiendas/${tienda.tienda_id}`} className={clasesBoton("contorno")}>Ver tienda</Link>}
          </div>
          {estadisticas ? <>
            <p className="text-sm text-suave">Los pedidos se cuentan por fecha de creación y las calificaciones por fecha de publicación.</p>
            <Estadisticas tienda={tienda} />
          </> : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {indicadores.map(([campo, titulo, ruta]) => tienda[campo] === null ? null : (
              <li key={campo}>
                <Link to={`/vendedor/${ruta}?tienda=${tienda.tienda_id}`} className="block h-full rounded-xl border border-borde bg-white p-4 hover:border-mercado">
                  <p className="text-3xl font-extrabold text-pino">{format(tienda[campo])}</p>
                  <p className="mt-1 text-sm font-bold">{titulo}</p>
                </Link>
              </li>
            ))}
          </ul>}
        </>
      )}
    </div>
  );
}
