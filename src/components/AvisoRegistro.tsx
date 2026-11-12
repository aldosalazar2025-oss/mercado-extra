import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";

// Aviso suave: no bloquea nada, solo recuerda completar o corregir la verificación.
export default function AvisoRegistro() {
  const { cargando, session, perfil, verificacion } = useAuth();
  if (cargando || !session || !perfil) return null;

  let texto: string | null = null;
  if (!verificacion) texto = "Completa tu registro para que podamos verificar tu identidad.";
  else if (verificacion.status === "rechazado") texto = "No pudimos verificar tu identidad. Revisa el motivo y vuelve a enviar tus datos.";
  if (!texto) return null;

  return (
    <div role="status" className="bg-maiz-suave px-4 py-2 text-center text-sm">
      {texto}{" "}
      <Link to={verificacion ? "/cuenta" : "/registro"} className="font-bold underline">
        {verificacion ? "Ver detalles" : "Completar registro"}
      </Link>
    </div>
  );
}
