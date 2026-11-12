import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Mensaje({ texto }: { texto: string }) {
  return <main className="mx-auto max-w-xl px-4 py-14 text-center text-suave">{texto}</main>;
}

export function RequiereSesion() {
  const { configurado, cargando, session } = useAuth();
  const ubicacion = useLocation();
  if (!configurado) return <Mensaje texto="Falta configurar Supabase (ver /estado)." />;
  if (cargando) return <Mensaje texto="Cargando…" />;
  if (!session) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  return <Outlet />;
}

export function RequiereAdmin() {
  const { cargando, perfil } = useAuth();
  if (cargando) return <Mensaje texto="Cargando…" />;
  if (!perfil?.is_admin) {
    return (
      <main className="mx-auto max-w-xl px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-extrabold text-pino">Acceso restringido</h1>
        <p className="mt-2 text-suave">Esta zona es solo para la administración de Mercado Extra.</p>
      </main>
    );
  }
  return <Outlet />;
}
