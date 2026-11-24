import type { ReactNode } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import ResumenComprador from "@/features/comprador/ResumenComprador";
import Cuenta from "@/features/identidad/Cuenta";
import ReclamosVendedor from "@/features/vendedor/ReclamosVendedor";
import ResumenVendedor from "@/features/vendedor/ResumenVendedor";
import MonetizacionVendedor from "@/features/monetizacion/MonetizacionVendedor";
import { AdminPlanes } from "@/features/monetizacion/Planes";
import SolicitudesComerciales from "@/features/monetizacion/SolicitudesComerciales";
import RegistrosAdmin from "@/features/admin/RegistrosAdmin";
import ResumenAdmin from "@/features/admin/ResumenAdmin";
import AdminVerificaciones from "@/features/identidad/AdminVerificaciones";
import AdminCategorias from "@/features/catalogo/AdminCategorias";
import AdminProductos from "@/features/catalogo/AdminProductos";
import SolicitudesRecibidas from "@/features/solicitudes/SolicitudesRecibidas";
import { ListaCasos } from "@/features/reclamos/ListaCasos";
import MisCalificaciones from "@/features/reputacion/MisCalificaciones";
import ListaPedidos from "@/features/pedidos/ListaPedidos";
import ChatPanel from "@/features/chat/ChatPanel";
import MisOfertas from "@/features/ofertas/MisOfertas";
import MisSolicitudes from "@/features/solicitudes/MisSolicitudes";
import MisProductos from "@/features/catalogo/MisProductos";
import AdminTiendas from "@/features/tiendas/AdminTiendas";
import MisTiendas from "@/features/tiendas/MisTiendas";
import { useMisPermisos } from "@/features/tiendas/hooks";
import { paneles, permisoSeccion, slug, type PanelId } from "./config";
import AvisosSanciones from "@/features/reclamos/AvisosSanciones";

function contenidoDe(panel: PanelId, seccion: string): ReactNode | null {
  if (panel === "vendedor" && seccion === "Resumen") return <ResumenVendedor />;
  if (panel === "vendedor" && seccion === "Estadísticas") return <ResumenVendedor key="estadisticas" estadisticas />;
  if (panel === "admin" && seccion === "Planes comerciales") return <AdminPlanes />;
  if (panel === "admin" && seccion === "Promociones") return <SolicitudesComerciales tipo="promocion" admin />;
  if (panel === "vendedor" && seccion === "Promociones y planes") return <MonetizacionVendedor />;
  if (panel === "admin" && seccion === "Resumen general") return <ResumenAdmin />;
  if (panel === "admin" && ["Usuarios", "Solicitudes", "Ofertas", "Operaciones", "Reputación", "Auditoría"].includes(seccion)) {
    return <RegistrosAdmin key={seccion} seccion={seccion} />;
  }
  if (panel === "admin" && seccion === "Verificación de identidad") return <AdminVerificaciones />;
  if (panel === "vendedor" && seccion === "Reclamos") return <ReclamosVendedor />;
  if (seccion === "Reclamos") return <ListaCasos key="reclamos" rol={panel} clase="reclamo" />;
  if (seccion === "Cancelaciones") return <ListaCasos key="cancelaciones" rol={panel} clase="cancelacion" />;
  if (seccion === "Sanciones") return <ListaCasos key="sanciones" rol={panel} clase="sancion" />;
  if (panel === "admin" && seccion === "Tiendas") return <AdminTiendas />;
  if (panel === "comprador" && seccion === "Inicio") return <ResumenComprador />;
  if (panel === "comprador" && seccion === "Ofertas recibidas") return <MisSolicitudes key="ofertas-recibidas" soloOfertas />;
  if (panel === "comprador" && seccion === "Mi perfil") return <Cuenta enPanel />;
  if (panel === "comprador" && seccion === "Mis solicitudes") return <MisSolicitudes />;
  if (panel === "admin" && seccion === "Categorías") return <AdminCategorias />;
  if (panel === "admin" && seccion === "Productos") return <AdminProductos />;
  if (panel === "vendedor" && seccion === "Solicitudes recibidas") return <SolicitudesRecibidas />;
  if (panel === "vendedor" && seccion === "Enviar ofertas") return <SolicitudesRecibidas soloPendientes />;
  if (panel === "vendedor" && seccion === "Mis ofertas") return <MisOfertas />;
  if (panel === "vendedor" && seccion === "Chat") return <ChatPanel rol="vendedor" />;
  if (panel === "vendedor" && seccion === "Pedidos") return <ListaPedidos rol="vendedor" />;
  if (panel === "vendedor" && seccion === "Evidencias de entrega") return <ListaPedidos rol="vendedor" soloEvidencias />;
  if (panel === "comprador" && seccion === "Mis calificaciones") return <MisCalificaciones rol="comprador" />;
  if (panel === "vendedor" && seccion === "Calificaciones") return <MisCalificaciones rol="vendedor" />;
  if (panel === "comprador" && seccion === "Mis compras") return <ListaPedidos rol="comprador" />;
  if (panel === "comprador" && seccion === "Chat") return <ChatPanel rol="comprador" />;
  if (panel === "vendedor" && seccion === "Mis productos") return <MisProductos />;
  if (panel === "vendedor" && seccion === "Mis tiendas") return <MisTiendas />;
  if (panel === "vendedor" && seccion === "Empleados y permisos") return <MisTiendas modo="empleados" />;
  return null;
}

type Props = { panel: PanelId; seccion?: string; contenido?: ReactNode };

const gruposAdmin = [
  { nombre: "General", secciones: ["Resumen general"] },
  { nombre: "Cuentas y catálogo", secciones: ["Usuarios", "Verificación de identidad", "Tiendas", "Categorías", "Productos"] },
  { nombre: "Operaciones", secciones: ["Solicitudes", "Ofertas", "Operaciones"] },
  { nombre: "Atención y moderación", secciones: ["Reclamos", "Cancelaciones", "Sanciones", "Reputación"] },
  { nombre: "Monetización", secciones: ["Promociones", "Planes comerciales"] },
  { nombre: "Control administrativo", secciones: ["Auditoría"] },
];

export default function Panel({ panel, seccion: seccionFija, contenido }: Props) {
  const { titulo, secciones: todas } = paneles[panel];
  const { seccion } = useParams();
  const navegar = useNavigate();
  const admin = panel === "admin";
  const misPermisos = useMisPermisos(panel === "vendedor");
  // En el panel de vendedor el menú solo muestra lo que la persona puede usar en alguna de sus tiendas.
  const visibles = (s: string) => {
    if (panel !== "vendedor") return true;
    const req = permisoSeccion[s] ?? null;
    return req === null || (misPermisos.data?.has(req) ?? false);
  };
  const secciones = todas.filter(visibles);
  const rutaSeccion = panel === "admin" && seccion === "reportes" ? "reputacion" : seccion;
  const pedida = seccionFija ?? todas.find((s) => slug(s) === rutaSeccion) ?? todas[0];
  const sinAcceso = panel === "vendedor" && !misPermisos.isLoading && !visibles(pedida);
  const actual = pedida;
  const verificaAcceso = panel === "vendedor" && Boolean(permisoSeccion[actual]);
  const real = verificaAcceso && misPermisos.isLoading ? <p className="text-suave">Consultando permisos…</p>
    : verificaAcceso && misPermisos.isError ? <p role="alert" className="text-error">No se pudieron consultar tus permisos.</p>
    : sinAcceso ? (
    <p className="rounded-xl bg-white p-6 text-suave">Tu rol en tus tiendas no incluye esta sección. Si la necesitas, pídele al propietario que te dé el permiso.</p>
  ) : (
    contenido ?? contenidoDe(panel, actual)
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label={titulo} className={admin ? "md:self-start" : "md:sticky md:top-20 md:max-h-[calc(100dvh-5.5rem)] md:self-start md:overflow-y-auto"}>
        <p className="mb-2 font-display text-lg font-extrabold text-pino">{titulo}</p>
        {admin ? <>
          <label className="block text-sm font-semibold md:hidden">Sección
            <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3"
              value={actual} onChange={(e) => void navegar(`/admin/${slug(e.target.value)}`)}>
              {gruposAdmin.map((grupo) => <optgroup key={grupo.nombre} label={grupo.nombre}>
                {grupo.secciones.map((s) => <option key={s}>{s}</option>)}
              </optgroup>)}
            </select>
          </label>
          <div className="hidden space-y-3 md:block">
            {gruposAdmin.map((grupo) => <section key={grupo.nombre} aria-label={grupo.nombre}>
              <p className="mb-1 px-3 text-xs font-semibold text-suave">{grupo.nombre}</p>
              <ul className="space-y-1">
                {grupo.secciones.map((s) => <li key={s}>
                  <NavLink to={`/admin/${slug(s)}`} aria-current={s === actual ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 font-bold ${s === actual ? "bg-mercado text-white" : "bg-white text-tinta hover:bg-hoja"}`}>
                    {s}
                  </NavLink>
                </li>)}
              </ul>
            </section>)}
          </div>
        </> : <ul className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:gap-1 md:overflow-visible">
          {secciones.map((s) => (
            <li key={s} className="shrink-0">
              <NavLink
                to={`/${panel}/${slug(s)}`}
                className={() => `block whitespace-nowrap rounded-lg px-3 py-2 font-bold ${s === actual ? "bg-mercado text-white" : "bg-white text-tinta hover:bg-hoja"}`}
                aria-current={s === actual ? "page" : undefined}
              >
                {s}
              </NavLink>
            </li>
          ))}
        </ul>}
      </nav>

      <main className="min-w-0 space-y-4">
        <h1 className="font-display text-3xl font-extrabold text-pino">{actual}</h1>
        {panel === "vendedor" && actual === "Resumen" && <AvisosSanciones destino="tienda" />}
        {panel === "comprador" && actual === "Inicio" && <AvisosSanciones destino="usuario" />}
        {real}
        <p className="text-sm">
          <Link to="/" className="font-bold text-mercado underline">Volver al inicio</Link>
        </p>
      </main>
    </div>
  );
}
