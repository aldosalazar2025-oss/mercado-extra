import { useState } from "react";
import Boton from "@/components/Boton";
import FiltroEstado from "@/components/FiltroEstado";
import { AccionesTarjeta, SeleccionPapelera, useAccionesPapelera, useSeleccionPapelera } from "@/features/admin/PapeleraAdmin";
import { FormularioCaso } from "@/features/reclamos/FormularioCaso";
import { accion, useCasosMutation } from "@/features/reclamos/casos";
import { soles } from "@/lib/format";
import { estadoComercial, useSolicitudesComerciales, type Promocion, type SolicitudPlan } from "./datos";

type Props = { tipo: "plan" | "promocion"; admin?: boolean; tienda?: string };

const colorEstado: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-900",
  activa: "bg-emerald-100 text-emerald-900",
  rechazada: "bg-red-100 text-red-900",
};

function FilaComercial({ tipo, fila, admin, seleccion, accionPapelera }: { tipo: Props["tipo"]; fila: Promocion | SolicitudPlan; admin: boolean;
  seleccion: ReturnType<typeof useSeleccionPapelera>; accionPapelera?: "eliminar" | "archivar" }) {
  const estado = estadoComercial(fila);
  const plan = "subscription_plans" in fila ? fila : null;
  const promo = "products" in fila ? fila : null;
  const rpc = tipo === "plan" ? "decidir_plan_comercial" : "decidir_promocion";
  const retirar = useCasosMutation(async () => accion(rpc, { p_id: fila.id, p_accion: "retirar", p_motivo: null }));
  const pendiente = estado === "pendiente";
  const activa = estado === "activa";

  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-borde bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-display text-lg font-bold text-pino">{plan ? plan.subscription_plans?.name ?? "Plan comercial" : promo?.products?.name ?? "Tienda destacada"}</h3>
          {admin && <p className="break-words text-sm text-suave">Tienda · {fila.stores?.name ?? "Sin nombre"}</p>}
        </div>
        <div className="flex items-center gap-1">
          <span className={`rounded-full px-3 py-1 text-sm font-bold capitalize ${colorEstado[estado] ?? "bg-slate-100 text-slate-700"}`}>{estado}</span>
          {admin && (accionPapelera || seleccion.visibles.includes(fila.id)) &&
            <AccionesTarjeta tabla={tipo === "plan" ? "subscriptions" : "promotions"} id={fila.id} seleccion={seleccion} accion={accionPapelera} />}
        </div>
      </div>
      <details className="rounded-lg border border-borde p-3">
        <summary className="cursor-pointer font-bold text-mercado">{plan ? "Ver detalles del plan" : "Ver detalles de la promoción"}</summary>
        <dl className="mt-3 grid gap-3 rounded-lg bg-hoja/40 p-3 text-sm sm:grid-cols-2">
          {promo && <div>
            <dt className="font-bold text-pino">Duración de la promoción</dt>
            <dd>{promo.dias} {promo.dias === 1 ? "día" : "días"}</dd>
          </div>}
          {plan && <div>
            <dt className="font-bold text-pino">Precio mensual acordado</dt>
            <dd>{plan.precio_acordado == null ? "Sin precio registrado" : soles(Number(plan.precio_acordado))}</dd>
          </div>}
          {fila.ends_at && <div>
            <dt className="font-bold text-pino">Fecha de vencimiento</dt>
            <dd>{new Date(fila.ends_at).toLocaleDateString("es-PE")}</dd>
          </div>}
          {fila.decision && <div className="sm:col-span-2">
            <dt className="font-bold text-pino">Motivo de la decisión</dt>
            <dd className="whitespace-pre-wrap break-words">{fila.decision}</dd>
          </div>}
        </dl>
      </details>
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
  const [estado, setEstado] = useState("");
  const consulta = useSolicitudesComerciales(tipo, tienda, pagina, admin, estado);
  const tabla = tipo === "plan" ? "subscriptions" : "promotions";
  const acciones = useAccionesPapelera(tabla, admin ? consulta.data?.filas.map((fila) => fila.id) ?? [] : []);
  const seleccion = useSeleccionPapelera(JSON.stringify([tipo, estado, pagina]),
    admin && estado ? consulta.data?.filas.map((fila) => fila.id) ?? [] : []);
  return (
    <div className="space-y-3">
      {admin && <FiltroEstado estados={tipo === "plan" ? ["pendiente", "activa", "cancelada", "vencida"] : ["pendiente", "activa", "rechazada", "pausada", "vencida"]}
        valor={estado} cambiar={(valor) => { setEstado(valor); setPagina(0); }} />}
      {admin && <SeleccionPapelera tabla={tabla} seleccion={seleccion} acciones={acciones} />}
      {consulta.isPending && <p className="text-suave">Cargando…</p>}
      {consulta.isError && <p role="alert" className="text-error">No se pudieron cargar los registros.</p>}
      {consulta.data?.filas.length === 0 && <p className="text-sm text-suave">No hay registros para este filtro.</p>}
      <ul className={admin ? "grid items-start gap-3 lg:grid-cols-2" : "space-y-3"}>
        {consulta.data?.filas.map((fila) => <FilaComercial key={fila.id} tipo={tipo} fila={fila} admin={admin}
          seleccion={seleccion} accionPapelera={acciones?.get(fila.id)} />)}
      </ul>
      {(pagina > 0 || consulta.data?.siguiente) && <nav className="flex flex-wrap items-center gap-2" aria-label="Páginas de resultados">
        <Boton variante="contorno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
        <span className="text-sm">Página {pagina + 1}</span>
        <Boton variante="contorno" disabled={!consulta.data?.siguiente} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
      </nav>}
    </div>
  );
}
