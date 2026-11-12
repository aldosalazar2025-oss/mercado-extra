import { Outlet, Route, Routes } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Pie from "@/components/Pie";
import Inicio from "@/pages/Inicio";
import Productos from "@/pages/Productos";
import Tiendas from "@/pages/Tiendas";
import Solicitar from "@/pages/Solicitar";
import Ingresar from "@/pages/Ingresar";
import Estado from "@/pages/Estado";
import Panel from "@/panels/Panel";

function Estructura() {
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-maiz focus:px-4 focus:py-2 focus:font-bold">
        Saltar al contenido
      </a>
      <Navbar />
      <div id="contenido">
        <Outlet />
      </div>
      <Pie />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/tiendas" element={<Tiendas />} />
        <Route path="/solicitar" element={<Solicitar />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/estado" element={<Estado />} />
        <Route path="/comprador/:seccion?" element={<Panel panel="comprador" />} />
        <Route path="/vendedor/:seccion?" element={<Panel panel="vendedor" />} />
        <Route path="/admin/:seccion?" element={<Panel panel="admin" />} />
        <Route path="*" element={<main className="mx-auto max-w-xl px-4 py-14 text-center"><h1 className="font-display text-3xl font-extrabold text-pino">Página no encontrada</h1></main>} />
      </Route>
    </Routes>
  );
}
