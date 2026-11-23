import { useState } from "react";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { accion, useCasosMutation } from "@/features/reclamos/casos";
import { soles } from "@/lib/format";
import { conexion, usePlanes, type Plan } from "./datos";
import SolicitudesComerciales from "./SolicitudesComerciales";

function EditorPlan({ plan }: { plan?: Plan }) {
  const [nombre, setNombre] = useState(plan?.name ?? "");
  const [precio, setPrecio] = useState(plan ? String(plan.price_month) : "");
  const [maximo, setMaximo] = useState(String(plan?.max_promociones ?? 2));
  const [medalla, setMedalla] = useState<Plan["medalla"]>(plan?.medalla ?? "ninguna");
  const [activo, setActivo] = useState(plan?.active ?? true);
  const guardar = useCasosMutation(async () => {
    const { error } = await conexion().rpc("admin_guardar_plan", {
      p_id: plan?.id ?? null, p_nombre: nombre.trim(), p_precio: Number(precio),
      p_maximo: Number(maximo), p_activo: activo, p_medalla: medalla,
    });
    if (error) throw new Error(error.message);
    if (!plan) { setNombre(""); setPrecio(""); }
  });

  return (
    <details className="rounded-xl border border-borde bg-white p-4">
      <summary className="cursor-pointer font-bold text-mercado">
        {plan ? `${plan.name} · ${soles(Number(plan.price_month))} al mes · ${plan.active ? "Disponible" : "Desactivado"}` : "Crear plan"}
      </summary>
      <form className="mt-3 space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (nombre.trim().length >= 2 && precio !== "") guardar.mutate();
      }}>
        <fieldset className="grid gap-3 sm:grid-cols-2" disabled={guardar.isPending}>
          <Campo id={`plan-nombre-${plan?.id ?? "nuevo"}`} etiqueta="Nombre" required minLength={2} maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Campo id={`plan-precio-${plan?.id ?? "nuevo"}`} etiqueta="Precio por un mes (S/)" type="number" required min={0} max={9999999999.99} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          <Campo id={`plan-maximo-${plan?.id ?? "nuevo"}`} etiqueta="Límite de promociones simultáneas" type="number" required min={1} max={20} value={maximo} onChange={(e) => setMaximo(e.target.value)} />
          <label className="block text-sm font-bold">Medalla del plan
            <select className={`mt-1 ${estiloInput}`} value={medalla} onChange={(e) => setMedalla(e.target.value as Plan["medalla"])}>
              <option value="ninguna">Sin medalla</option>
              <option value="bronce">Bronce</option>
              <option value="plata">Plata</option>
              <option value="oro">Oro</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Disponible para nuevas solicitudes</label>
        </fieldset>
        <Boton type="submit" disabled={guardar.isPending}>{guardar.isPending ? "Guardando…" : "Guardar plan"}</Boton>
        {guardar.isError && <p role="alert" className="text-error">{guardar.error.message}</p>}
        {guardar.isSuccess && <p role="status" className="text-pino">Plan guardado.</p>}
      </form>
    </details>
  );
}

export function AdminPlanes() {
  const planes = usePlanes(true);
  return (
    <div className="space-y-4">
      <EditorPlan />
      {planes.isLoading && <p className="text-suave">Cargando planes…</p>}
      {planes.isError && <p role="alert" className="text-error">No se pudieron cargar los planes.</p>}
      {planes.data?.map((plan) => <EditorPlan key={plan.id} plan={plan} />)}
      <h2 className="font-display text-xl font-bold text-pino">Solicitudes de planes</h2>
      <p className="text-sm text-suave">Verifica el acuerdo con la tienda antes de activar un plan con precio. La plataforma no procesa el cobro.</p>
      <SolicitudesComerciales tipo="plan" admin />
    </div>
  );
}

export function SolicitarPlan({ tienda }: { tienda: string }) {
  const planes = usePlanes();
  const [seleccion, setSeleccion] = useState("");
  const plan = planes.data?.find((fila) => fila.id === seleccion);
  const solicitar = useCasosMutation(async () => {
    if (!plan) throw new Error("Elige un plan disponible.");
    await accion("solicitar_plan_comercial", { p_tienda: tienda, p_plan: plan.id });
    setSeleccion("");
  });
  return (
    <form className="space-y-3 rounded-xl border border-borde bg-white p-4" onSubmit={(e) => {
      e.preventDefault();
      if (plan && confirm(`¿Solicitar ${plan.name} por ${soles(Number(plan.price_month))} para un mes?`)) solicitar.mutate();
    }}>
      {planes.isLoading && <p className="text-suave">Cargando planes…</p>}
      {planes.isError && <p role="alert" className="text-error">No se pudieron cargar los planes.</p>}
      {planes.data?.length === 0 && <p className="text-suave">Por ahora no hay planes disponibles.</p>}
      {Boolean(planes.data?.length) && <>
        <label className="block text-sm font-bold">Plan disponible
          <select className={`mt-1 ${estiloInput}`} required value={seleccion} onChange={(e) => setSeleccion(e.target.value)}>
            <option value="">Elige un plan</option>
            {planes.data?.map((fila) => <option key={fila.id} value={fila.id}>{fila.name} · {soles(Number(fila.price_month))} al mes</option>)}
          </select>
        </label>
        {plan && <p className="text-sm">Hasta {plan.max_promociones} {plan.max_promociones === 1 ? "promoción simultánea" : "promociones simultáneas"}.</p>}
        <p className="text-sm text-suave">Los planes dan prioridad en Inicio. Si el plan incluye una medalla, se muestra junto al nombre de la tienda. Las promociones vigentes de planes mayores aparecen primero entre las promociones.</p>
        <p className="text-sm text-suave">El plan dura un mes desde su activación manual. Enviar la solicitud no realiza ningún cobro.</p>
        <Boton type="submit" disabled={!plan || solicitar.isPending}>Solicitar plan</Boton>
      </>}
      {solicitar.isError && <p role="alert" className="text-error">{solicitar.error.message}</p>}
      {solicitar.isSuccess && <p role="status" className="text-pino">Solicitud enviada para revisión.</p>}
    </form>
  );
}
