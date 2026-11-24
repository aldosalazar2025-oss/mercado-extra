import { useState } from "react";
import Boton from "@/components/Boton";
import { accion, motivos, useCasosMutation } from "./casos";

type Props = {
  titulo: string;
  boton?: string;
  etiquetaTexto?: string;
  minimo?: number;
  opciones?: readonly (readonly [string, string])[];
  ejecutar: (texto: string, opcion: string, dias: number, horas: number) => Promise<void>;
  confirmar?: boolean;
  pedirDias?: boolean;
  destinatario?: string;
  repetir?: boolean;
};

export function FormularioCaso({ titulo, boton = titulo, etiquetaTexto = "Explicación", minimo = 5, opciones, ejecutar, confirmar, pedirDias, destinatario, repetir }: Props) {
  const [texto, setTexto] = useState("");
  const [opcion, setOpcion] = useState(opciones?.[0]?.[0] ?? "");
  const [dias, setDias] = useState(7);
  const [horas, setHoras] = useState(0);
  const suspension = pedirDias && opcion === "suspension_temporal";
  const advertencia = pedirDias && opcion === "advertencia";
  const duracionValida = advertencia ? dias >= 1 && dias <= 365
    : !suspension || (dias * 24 + horas >= 1 && dias * 24 + horas <= 365 * 24);
  const envio = useCasosMutation(async () => {
    await ejecutar(texto.trim(), opcion, dias, suspension ? horas : 0);
    if (repetir) setTexto("");
  });

  if (envio.isSuccess && !repetir) return <p role="status" className="text-sm text-pino">Acción registrada.</p>;
  return (
    <details className="rounded-lg border border-borde p-3">
      <summary className="cursor-pointer font-bold text-mercado">{titulo}</summary>
      <form className="mt-3 space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (duracionValida && texto.trim().length >= minimo && (!confirmar || confirm(destinatario ? `¿Confirmas la sanción para ${destinatario}?` : "¿Confirmas esta acción?"))) envio.mutate();
      }}>
        <fieldset className="space-y-3" disabled={envio.isPending}>
          {destinatario && <p className="rounded-lg bg-hoja/40 p-3 text-sm"><strong>Se sancionará a </strong>{destinatario}</p>}
          {opciones && <label className="block text-sm font-bold">Selecciona una opción
            <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white p-2" value={opcion} onChange={(e) => setOpcion(e.target.value)}>
              {opciones.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
            </select>
          </label>}
          {destinatario && <p className="text-sm text-suave">
            Primera falta leve: advertencia. Reincidencia: 3 a 7 días. Falta grave: 15 a 30 días. Fraude comprobado o reincidencia grave: bloqueo.
          </p>}
          {(suspension || advertencia) && <div className="flex flex-wrap gap-3">
            <label className="text-sm font-bold">{advertencia ? "Días de advertencia" : "Días de suspensión"}
              <input type="number" min={advertencia ? 1 : 0} max={365} required className="mt-1 block w-24 rounded border border-borde p-2" value={dias} onChange={(e) => setDias(Number(e.target.value))} />
            </label>
            {suspension && <label className="text-sm font-bold">Horas adicionales
              <input type="number" min={0} max={23} required className="mt-1 block w-24 rounded border border-borde p-2" value={horas} onChange={(e) => setHoras(Number(e.target.value))} />
            </label>}
            {!duracionValida && <p className="w-full text-sm text-error">
              {advertencia ? "Indica entre 1 y 365 días." : "Indica una duración entre una hora y 365 días."}
            </p>}
          </div>}
          <label className="block text-sm font-bold">{etiquetaTexto}
            <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" required rows={3}
              value={texto} minLength={minimo} maxLength={3000} onChange={(event) => setTexto(event.target.value)} />
          </label>
          <Boton type="submit" disabled={!duracionValida || texto.trim().length < minimo}>{envio.isPending ? "Guardando…" : boton}</Boton>
        </fieldset>
        {repetir && envio.isSuccess && <p role="status" className="text-sm text-pino">Acción registrada.</p>}
        {envio.isError && <p role="alert" className="text-sm text-error">{envio.error.message}</p>}
      </form>
    </details>
  );
}

export function CancelarPedido({ id }: { id: string }) {
  return <FormularioCaso titulo="Cancelar pedido" opciones={motivos} confirmar
    ejecutar={(texto, motivo) => accion("cancelar_operacion", { p_id: id, p_es_pedido: true, p_motivo: motivo, p_detalle: texto })} />;
}
