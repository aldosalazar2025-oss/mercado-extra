import { etiquetaEstado, type EstadoTienda } from "./tipos";

export default function Insignia({ estado }: { estado: EstadoTienda }) {
  const e = etiquetaEstado[estado];
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${e.clase}`}>{e.texto}</span>;
}
