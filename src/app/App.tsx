import { Route, Routes } from "react-router-dom";
import EstadoConexion from "@/features/health/EstadoConexion";

function Inicio() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-3xl font-bold">MERCADO EXTRA</h1>
      <p className="mt-2 text-slate-700">Entorno preparado (Etapa 2). El diseno visual llega en la Etapa 3.</p>
      <section className="mt-6">
        <h2 className="mb-2 font-semibold">Estado del entorno</h2>
        <EstadoConexion />
      </section>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="*" element={<main className="p-6">Pagina no encontrada.</main>} />
    </Routes>
  );
}
