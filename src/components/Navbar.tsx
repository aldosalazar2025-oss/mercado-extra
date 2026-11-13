import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import Logo from "./Logo";
import { clasesBoton } from "./Boton";
import { useAuth } from "@/features/auth/AuthContext";
import Campana from "@/features/notificaciones/Campana";
import LimiteDeErrores from "./LimiteDeErrores";

const enlaces = [
  { to: "/productos", texto: "Productos" },
  { to: "/tiendas", texto: "Tiendas" },
];

const estiloEnlace = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 font-bold ${isActive ? "bg-hoja text-pino" : "text-tinta hover:bg-hoja"}`;

export default function Navbar() {
  const [abierto, setAbierto] = useState(false);
  const { session, cerrarSesion } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-borde bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" aria-label="Mercado Extra, ir al inicio" onClick={() => setAbierto(false)}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} className={estiloEnlace}>{e.texto}</NavLink>
          ))}
          <a href="/#como-funciona" className="rounded-lg px-3 py-2 font-bold hover:bg-hoja">Cómo funciona</a>
          {session ? (
            <>
              <LimiteDeErrores discreto><Campana /></LimiteDeErrores>
              <Link to="/cuenta" className={`${clasesBoton("contorno")} ml-1`}>Mi cuenta</Link>
              <button type="button" className="rounded-lg px-3 py-2 font-bold hover:bg-hoja" onClick={() => void cerrarSesion()}>Salir</button>
            </>
          ) : (
            <Link to="/ingresar" className={`${clasesBoton("contorno")} ml-2`}>Ingresar</Link>
          )}
          <Link to="/solicitar" className={clasesBoton("primario")}>Publicar solicitud</Link>
        </nav>

        <div className="flex items-center gap-1 md:hidden">
          <LimiteDeErrores discreto><Campana /></LimiteDeErrores>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-borde"
          aria-expanded={abierto}
          aria-controls="menu-movil"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setAbierto(!abierto)}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            {abierto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        </div>
      </div>

      {abierto && (
        <nav id="menu-movil" className="flex flex-col gap-1 border-t border-borde bg-white px-4 py-3 md:hidden" aria-label="Menú móvil">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} className={estiloEnlace} onClick={() => setAbierto(false)}>{e.texto}</NavLink>
          ))}
          <a href="/#como-funciona" className="rounded-lg px-3 py-2 font-bold hover:bg-hoja">Cómo funciona</a>
          <Link to="/solicitar" className={`${clasesBoton("primario")} mt-2`} onClick={() => setAbierto(false)}>Publicar solicitud</Link>
          {session ? (
            <>
              <Link to="/cuenta" className={clasesBoton("contorno")} onClick={() => setAbierto(false)}>Mi cuenta</Link>
              <button type="button" className="rounded-lg px-3 py-2 text-left font-bold hover:bg-hoja" onClick={() => { setAbierto(false); void cerrarSesion(); }}>Salir</button>
            </>
          ) : (
            <Link to="/ingresar" className={clasesBoton("contorno")} onClick={() => setAbierto(false)}>Ingresar</Link>
          )}
        </nav>
      )}
    </header>
  );
}
