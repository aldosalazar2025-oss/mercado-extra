import { useNavigate } from "react-router-dom";
import FormularioSolicitud from "@/features/solicitudes/FormularioSolicitud";

export default function Solicitar() {
  const ir = useNavigate();
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Publicar una solicitud</h1>
      <p className="text-suave">Cuéntanos qué buscas. Las tiendas que venden algo relacionado te harán sus ofertas y tú eliges la mejor.</p>
      <FormularioSolicitud onGuardado={() => ir("/comprador/mis-solicitudes", { replace: true })} />
    </main>
  );
}
