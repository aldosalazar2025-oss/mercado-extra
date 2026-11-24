export default function FiltroEstado<T extends string>({ estados, valor, cambiar, etiqueta = "Estado" }: {
  estados: readonly T[];
  valor: T | "";
  cambiar: (estado: T | "") => void;
  etiqueta?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {etiqueta}
      <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3 capitalize sm:min-w-40"
        value={valor} onChange={(e) => cambiar(e.target.value as T | "")}>
        <option value="">Todos</option>
        {estados.map((estado) => <option key={estado} value={estado}>{estado.replace(/_/g, " ")}</option>)}
      </select>
    </label>
  );
}
