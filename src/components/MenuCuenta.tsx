import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { useMiAccesoAdmin } from "@/features/admin/EquipoAdmin";
import FotoPerfil from "./FotoPerfil";

const trazos = {
  operaciones: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6",
  tienda: "M3 10l2-6h14l2 6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 13v7h14v-7m-9 7v-5h4v5",
  admin: "M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9Zm-3-10 2 2 4-4",
  salir: "M10 17l5-5-5-5m5 5H3m10-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6",
  verificado: "M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9Zm-3-10 2 2 4-4",
};

function Icono({ tipo }: { tipo: keyof typeof trazos }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-mercado"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={trazos[tipo]} />
    </svg>
  );
}

export default function MenuCuenta({ panel }: { panel: RefObject<HTMLDialogElement> }) {
  const { perfil, session, verificacion, cerrarSesion } = useAuth();
  const accesoAdmin = useMiAccesoAdmin();
  const cerrar = () => panel.current?.close();
  const estilo = "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-bold text-tinta hover:bg-hoja";

  return (
    <dialog id="menu-cuenta" ref={panel} aria-labelledby="titulo-menu-cuenta"
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-sm overflow-y-auto bg-white p-0 text-tinta shadow-xl backdrop:bg-pino/45"
      onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div className="min-h-full space-y-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-menu-cuenta" className="font-display text-xl font-extrabold text-pino">Perfil</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar menú de cuenta"
            className="h-11 w-11 rounded-lg text-2xl hover:bg-hoja">×</button>
        </div>
        <section className="flex flex-col items-center gap-1 rounded-xl bg-hoja p-4 text-center">
          {verificacion?.status === "verificado" && (
            <div className="mb-3 space-y-1">
              <p className="flex items-center justify-center gap-2 font-bold text-pino">
                <Icono tipo="verificado" /> Identidad verificada
              </p>
              <p className="text-sm text-suave">Tu identidad fue verificada. ¡Gracias!</p>
            </div>
          )}
          <FotoPerfil className="mb-2 h-16 w-16 text-xl" />
          <p className="font-bold">{perfil?.full_name || "Mi perfil"}</p>
          <p className="max-w-full break-words text-sm text-suave">{perfil?.email ?? session?.user.email}</p>
        </section>
        <nav aria-label="Opciones de cuenta">
          <ul className="space-y-1">
            <li><Link to="/comprador" className={estilo} onClick={cerrar}><Icono tipo="operaciones" /> Mis operaciones</Link></li>
            <li><Link to="/vendedor/mis-tiendas" className={estilo} onClick={cerrar}><Icono tipo="tienda" /> Mis tiendas</Link></li>
            {perfil?.is_admin && perfil.status === "activo" && (
              <li><Link to="/admin" className={estilo} onClick={cerrar}><Icono tipo="admin" /> Panel administrativo</Link></li>
            )}
            {!perfil?.is_admin && accesoAdmin.data && (
              <li><Link to="/acceso-administrativo" className={estilo} onClick={cerrar}><Icono tipo="admin" />
                {accesoAdmin.data.estado === "pendiente" ? "Invitación administrativa" : "Acceso administrativo"}
              </Link></li>
            )}
            <li><button type="button" className={estilo} onClick={() => { cerrar(); void cerrarSesion(); }}><Icono tipo="salir" /> Cerrar sesión</button></li>
          </ul>
        </nav>
      </div>
    </dialog>
  );
}
