import EstadoConexion from "@/features/health/EstadoConexion";

export default function Estado() {
  return (
    <main className="mx-auto max-w-xl space-y-3 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Estado del sistema</h1>
      <EstadoConexion />
    </main>
  );
}
