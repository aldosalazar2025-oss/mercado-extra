import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Destino de Google: espera a que la sesión esté lista y decide a dónde enviar al usuario.
export default function AuthCallback() {
  const { cargando, session, verificacion } = useAuth();
  const ir = useNavigate();

  useEffect(() => {
    if (cargando) return;
    if (!session) ir("/ingresar", { replace: true });
    else ir(verificacion ? "/cuenta" : "/registro", { replace: true });
  }, [cargando, session, verificacion, ir]);

  return <main className="mx-auto max-w-xl px-4 py-14 text-center text-suave">Entrando a tu cuenta…</main>;
}
