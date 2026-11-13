import { Outlet, Route, Routes } from "react-router-dom";
import Navbar from "@/components/Navbar";
import LimiteDeErrores from "@/components/LimiteDeErrores";
import NotificacionesEnVivo from "@/features/notificaciones/NotificacionesEnVivo";
import Pie from "@/components/Pie";
import Inicio from "@/pages/Inicio";
import Productos from "@/pages/Productos";
import Tiendas from "@/pages/Tiendas";
import Solicitar from "@/pages/Solicitar";
import Ingresar from "@/pages/Ingresar";
import Estado from "@/pages/Estado";
import Panel from "@/panels/Panel";
import AvisoRegistro from "@/components/AvisoRegistro";
import AuthCallback from "@/features/auth/AuthCallback";
import { RequiereAdmin, RequiereSesion } from "@/features/auth/Rutas";
import Registro from "@/features/identidad/Registro";
import Cuenta from "@/features/identidad/Cuenta";
import Privacidad from "@/pages/Privacidad";
import Notificaciones from "@/pages/Notificaciones";
import ProductoDetalle from "@/pages/ProductoDetalle";
import TiendaPublica from "@/pages/TiendaPublica";
import ProductoEditor from "@/features/catalogo/ProductoEditor";
import SolicitudEditor from "@/features/solicitudes/SolicitudEditor";
import NuevaTienda from "@/features/tiendas/NuevaTienda";
import TiendaDetalle from "@/features/tiendas/TiendaDetalle";

function Estructura() {
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-maiz focus:px-4 focus:py-2 focus:font-bold">
        Saltar al contenido
      </a>
      <LimiteDeErrores discreto><NotificacionesEnVivo /></LimiteDeErrores>
      <Navbar />
      <AvisoRegistro />
      <div id="contenido">
        <LimiteDeErrores>
          <Outlet />
        </LimiteDeErrores>
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
        <Route path="/productos/:id" element={<ProductoDetalle />} />
        <Route path="/tiendas" element={<Tiendas />} />
        <Route path="/tiendas/:id" element={<TiendaPublica />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/estado" element={<Estado />} />
        <Route path="/privacidad" element={<Privacidad />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequiereSesion />}>
          <Route path="/notificaciones" element={<Notificaciones />} />
          <Route path="/solicitar" element={<Solicitar />} />
          <Route path="/comprador/mis-solicitudes/:id/editar" element={<Panel panel="comprador" seccion="Mis solicitudes" contenido={<SolicitudEditor />} />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/comprador/:seccion?" element={<Panel panel="comprador" />} />
          <Route path="/vendedor/mis-productos/nuevo" element={<Panel panel="vendedor" seccion="Mis productos" contenido={<ProductoEditor />} />} />
          <Route path="/vendedor/mis-productos/:productoId" element={<Panel panel="vendedor" seccion="Mis productos" contenido={<ProductoEditor />} />} />
          <Route path="/vendedor/mis-tiendas/nueva" element={<Panel panel="vendedor" seccion="Mis tiendas" contenido={<NuevaTienda />} />} />
          <Route path="/vendedor/mis-tiendas/:tiendaId" element={<Panel panel="vendedor" seccion="Mis tiendas" contenido={<TiendaDetalle />} />} />
          <Route path="/vendedor/:seccion?" element={<Panel panel="vendedor" />} />
          <Route element={<RequiereAdmin />}>
            <Route path="/admin/:seccion?" element={<Panel panel="admin" />} />
          </Route>
        </Route>
        <Route path="*" element={<main className="mx-auto max-w-xl px-4 py-14 text-center"><h1 className="font-display text-3xl font-extrabold text-pino">Página no encontrada</h1></main>} />
      </Route>
    </Routes>
  );
}
