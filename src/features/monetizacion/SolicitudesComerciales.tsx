import { useState } from "react";
import Boton from "@/components/Boton";
import { FormularioCaso } from "@/features/reclamos/FormularioCaso";
import { accion, useCasosMutation } from "@/features/reclamos/casos";
import { soles } from "@/lib/format";
import { estadoComercial, useSolicitudesComerciales, type Promocion, type SolicitudPlan } from "./datos";

type Props = { tipo: "plan" | "promocion"; admin?: boolean; tienda?: string };

const colorPromocion: Record<string, string> = {
  pendiente: "text-amber-800",
  activa: "text-emerald-800",
  rechazada: "text-error",
  pausada: "text-slate-600",
  vencida: "text-slate-600",
};

function FilaComercial({ tipo, fila, admin }: { tipo: Props["tipo"]; fila: Promocion | SolicitudPlan; admin: boolean }) {
  const estado = estadoComercial(fila);
  const plan = "subscription_plans" in fila ? fila : null;
  const promo = "products" in fila ? fila : null;
  const rpc = tipo === "plan" ? "decidir_plan_comercial" : "decidir_promocion";
  const retirar = useCasosMutation(async () => accion(rpc, { p_id: fila.id, p_accion: "retirar", p_motivo: null }));
  const pendiente = estado === "pendiente";
  const activa = estado === "activa";

  return (
    <li className="space-y-2 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold">{plan ? plan.subscription_plans?.name ?? "Plan comercial" : promo?.products?.name ?? "Tienda destacada"}</h3>
      {admin && <p className="text-sm text-suave">{fila.stores?.name ?? "Tienda"}</p>}
      <p className="text-sm capitalize text-suave">
        <span className={admin && tipo === "promocion" ? `font-bold ${colorPromocion[estado] ?? "text-slate-600"}` : ""}>{estado}</span>
        {activa && fila.ends_at ? ` · Hasta ${new Date(fila.ends_at).toLocaleDateString("es-PE")}` : ""}</p>
      {plan?.precio_acordado != null && <p className="text-sm">{soles(Number(plan.precio_acordado))} por un mes</p>}
      {promo && <p className="text-sm">Duración · {promo.dias} días</p>}
      {fila.decision && <p className="whitespace-pre-wrap break-words text-sm">{fila.decision}</p>}
      {admin && (pendiente || activa) && (
        <FormularioCaso key={estado} titulo={pendiente ? "Resolver solicitud" : plan ? "Finalizar plan" : "Pausar promoción"} confirmar
          opciones={pendiente ? [["activar", "Activar"], ["rechazar", "Rechazar"]] : undefined}
          ejecutar={(motivo, opcion) => accion(rpc, { p_id: fila.id, p_accion: pendiente ? opcion : plan ? "finalizar" : "pausar", p_motivo: motivo })} />
      )}
      {!admin && (pendiente || (activa && promo)) && (
        <Boton variante="contorno" disabled={retirar.isPending} onClick={() => {
          if (confirm("¿Retirar este registro?")) retirar.mutate();
        }}>{activa ? "Retirar promoción" : "Retirar solicitud"}</Boton>
      )}
      {retirar.isError && <p role="alert" className="text-error">{retirar.error.message}</p>}
    </li>
  );
}

export default function SolicitudesComerciales({ tipo, admin = false, tienda }: Props) {
  const [pagina, setPagina] = useState(0);
  const consulta = useSolicitudesComerciales(tipo, tienda, pagina, admin);
  if (consulta.isPending) return <p className="text-suave">Cargando…</p>;
  if (consulta.isError) return <p role="alert" className="text-error">No se pudieron cargar los registros.</p>;
  return (
    <div className="space-y-3">
      {consulta.data.filas.length === 0 && <p className="text-sm text-suave">No hay registros en esta página.</p>}
      <ul className="space-y-3">{consulta.data.filas.map((fila) => <FilaComercial key={fila.id} tipo={tipo} fila={fila} admin={admin} />)}</ul>
      {(pagina > 0 || consulta.data.siguiente) && <nav className="flex flex-wrap items-center gap-2" aria-label="Páginas de resultados">
        <Boton variante="contorno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
        <span className="text-sm">Página {pagina + 1}</span>
        <Boton variante="contorno" disabled={!consulta.data.siguiente} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
      </nav>}
    </div>
  );
}
