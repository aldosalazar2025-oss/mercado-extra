import { useSearchParams } from "react-router-dom";
import { estiloInput } from "@/components/Campo";

export default function SelectorTiendaVendedor({ tiendas }: { tiendas: { id: string; name: string }[] }) {
  const [parametros, setParametros] = useSearchParams();
  const elegida = parametros.get("tienda") ?? "";

  if (tiendas.length <= 1 && !elegida) return null;
  return (
    <label className="block max-w-xs font-bold">Filtrar por tienda
      <select className={`mt-1 ${estiloInput}`} value={elegida} onChange={(event) => {
        const siguientes = new URLSearchParams(parametros);
        if (event.target.value) siguientes.set("tienda", event.target.value);
        else siguientes.delete("tienda");
        setParametros(siguientes);
      }}>
        <option value="">Todas mis tiendas</option>
        {elegida && !tiendas.some((tienda) => tienda.id === elegida) && <option value={elegida} disabled>Tienda seleccionada</option>}
        {tiendas.map((tienda) => <option key={tienda.id} value={tienda.id}>{tienda.name}</option>)}
      </select>
    </label>
  );
}
