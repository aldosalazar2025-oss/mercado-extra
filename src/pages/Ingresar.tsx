import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { guardarDestino } from "@/lib/destino";

export default function Ingresar() {
  const { configurado, cargando, session, iniciarConGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ir = useNavigate();
  const ubicacion = useLocation();

  useEffect(() => {
    if (!cargando && session) ir("/cuenta", { replace: true });
  }, [cargando, session, ir]);

  async function entrar() {
    setEnviando(true);
    guardarDestino((ubicacion.state as { desde?: string } | null)?.desde);
    setError(await iniciarConGoogle());
    setEnviando(false);
  }

  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-14 text-center">
      <h1 className="font-display text-3xl font-extrabold text-pino">Ingresar</h1>
      <p className="text-suave">Entras con tu cuenta de Google. No necesitas crear ni recordar una contraseña.</p>
      <Boton variante="secundario" className="w-full" disabled={!configurado || enviando} onClick={entrar}>
        {enviando ? "Abriendo Google…" : "Continuar con Google"}
      </Boton>
      {!configurado && <p className="text-sm text-error">Falta configurar Supabase (ver «Estado del sistema» al pie de la página).</p>}
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <p className="text-sm text-suave">Ingresar y comprar es gratis. Al continuar aceptas el uso de tus datos según la política de privacidad.</p>
    </main>
  );
}
