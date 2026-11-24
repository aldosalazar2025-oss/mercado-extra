import ResumenReputacion from "@/features/reputacion/ResumenReputacion";
import { Link } from "react-router-dom";
import FotoPerfil from "@/components/FotoPerfil";
import Boton, { clasesBoton } from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import EditarTelefono from "@/features/comprador/EditarTelefono";
import Invitaciones from "@/features/tiendas/Invitaciones";

const textos = {
  pendiente: { titulo: "Verificación pendiente", clase: "bg-maiz-suave", detalle: "Estamos revisando tus datos. Mientras tanto puedes usar Mercado Extra con normalidad." },
  verificado: { titulo: "Identidad verificada", clase: "bg-hoja", detalle: "Tu identidad fue verificada. ¡Gracias!" },
  rechazado: { titulo: "Verificación rechazada", clase: "bg-white border border-error/40", detalle: "No pudimos verificar tus datos." },
} as const;

export default function Cuenta({ enPanel = false }: { enPanel?: boolean }) {
  const { session, perfil, verificacion, cerrarSesion } = useAuth();
  const estado = verificacion ? textos[verificacion.status] : null;

  const Contenedor = enPanel ? "div" : "main";
  return (
    <Contenedor className={enPanel ? "max-w-xl space-y-5" : "mx-auto max-w-xl space-y-5 px-4 py-10"}>
      {!enPanel && <h1 className="font-display text-3xl font-extrabold text-pino">Mi cuenta</h1>}
      <section className="flex flex-col items-center gap-1 rounded-xl border border-borde bg-white p-5 text-center">
        <FotoPerfil className="mb-2 h-16 w-16 text-xl" />
        <p className="font-bold">{perfil?.full_name || "Sin nombre registrado"}</p>
        <p className="max-w-full break-words text-suave">{perfil?.email ?? session?.user.email}</p>
        {enPanel && <ResumenReputacion id={session?.user.id ?? ""} tipo="comprador" mostrarDistribucion />}
      </section>

      {enPanel && perfil && <EditarTelefono key={perfil.id} />}
      {!enPanel && <Invitaciones />}

      {!verificacion && (
        <section className="space-y-2 rounded-xl bg-maiz-suave p-4">
          <p className="font-bold">Falta completar tu registro</p>
          <Link to="/registro" className={clasesBoton("secundario")}>Completar registro</Link>
        </section>
      )}
      {verificacion && estado && (
        <section className={`space-y-2 rounded-xl p-4 ${estado.clase}`} aria-live="polite">
          <p className="font-bold">{estado.titulo}</p>
          <p>{estado.detalle}</p>
          {verificacion.status === "rechazado" && (
            <>
              <p><strong>Motivo:</strong> {verificacion.rejection_reason ?? "sin detalle"}</p>
              <Link to="/registro" className={clasesBoton("secundario")}>Corregir y volver a enviar</Link>
            </>
          )}
        </section>
      )}

      {!enPanel && <div className="flex flex-wrap gap-3">
        <Link to="/vendedor/mis-tiendas" className={clasesBoton("contorno")}>Mis tiendas</Link>
        {perfil?.is_admin && <Link to="/admin" className={clasesBoton("contorno")}>Panel administrativo</Link>}
        <div className="flex max-w-full flex-wrap gap-3">
          <Link to="/comprador" className={clasesBoton("contorno")}>Mis operaciones</Link>
          <Boton variante="contorno" onClick={() => void cerrarSesion()}>Cerrar sesión</Boton>
        </div>
      </div>}
    </Contenedor>
  );
}
