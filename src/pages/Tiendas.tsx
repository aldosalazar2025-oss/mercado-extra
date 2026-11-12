import TarjetaTienda from "@/components/TarjetaTienda";
import { tiendas } from "@/lib/demoData";

export default function Tiendas() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Explorar tiendas</h1>
      <div className="grid gap-4 md:grid-cols-2">{tiendas.map((t) => <TarjetaTienda key={t.id} t={t} />)}</div>
    </main>
  );
}
