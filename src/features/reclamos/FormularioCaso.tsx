import { useState } from "react";
import Boton from "@/components/Boton";
import { accion, motivos, useCasosMutation } from "./casos";

type Props = {
  titulo: string;
  boton?: string;
  etiquetaTexto?: string;
  minimo?: number;
  opciones?: readonly (readonly [string, string])[];
  ejecutar: (texto: string, opcion: string, dias: number) => Promise<void>;
  confirmar?: boolean;
  pedirDias?: boolean;
  repetir?: boolean;
};

export function FormularioCaso({ titulo, boton = titulo, etiquetaTexto = "Explicación", minimo = 5, opciones, ejecutar, confirmar, pedirDias, repetir }: Props) {
  const [texto, setTexto] = useState("");
  const [opcion, setOpcion] = useState(opciones?.[0]?.[0] ?? "");
  const [dias, setDias] = useState(7);
  const envio = useCasosMutation(async () => {
    await ejecutar(texto.trim(), opcion, dias);
    if (repetir) setTexto("");
  });

  if (envio.isSuccess && !repetir) return <p role="status" className="text-sm text-pino">Acción registrada.</p>;
  return (
    <details className="rounded-lg border border-borde p-3">
      <summary className="cursor-pointer font-bold text-mercado">{titulo}</summary>
      <form className="mt-3 space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (texto.trim().length >= minimo && (!confirmar || confirm("¿Confirmas esta acción?"))) envio.mutate();
      }}>
        <fieldset className="space-y-3" disabled={envio.isPending}>
          {opciones && <label className="block text-sm font-bold">Selecciona una opción
            <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white p-2" value={opcion} onChange={(e) => setOpcion(e.target.value)}>
              {opciones.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
            </select>
          </label>}
          {pedirDias && opcion === "suspension_temporal" && <label className="block text-sm font-bold">Días de suspensión
            <input type="number" min={1} max={365} required className="ml-2 rounded border border-borde p-2" value={dias} onChange={(e) => setDias(Number(e.target.value))} />
          </label>}
          <label className="block text-sm font-bold">{etiquetaTexto}
            <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" required rows={3}
              value={texto} minLength={minimo} maxLength={3000} onChange={(event) => setTexto(event.target.value)} />
          </label>
          <Boton type="submit" disabled={texto.trim().length < minimo}>{envio.isPending ? "Guardando…" : boton}</Boton>
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
