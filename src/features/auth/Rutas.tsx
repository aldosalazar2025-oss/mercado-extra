import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { ListaCasos } from "@/features/reclamos/ListaCasos";
import { supabase } from "@/lib/supabase";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Mensaje({ texto }: { texto: string }) {
  return <main className="mx-auto max-w-xl px-4 py-14 text-center text-suave">{texto}</main>;
}

export function RequiereSesion() {
  const { configurado, cargando, session, perfil, cerrarSesion, recargar } = useAuth();
  const ubicacion = useLocation();
  const uid = session?.user.id;
  const cuenta = useQuery({
    queryKey: ["estado-de-cuenta", uid],
    enabled: Boolean(uid && perfil && supabase),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!uid || !supabase) throw new Error("Sin conexión");
      const [estado, activa] = await Promise.all([
        supabase.from("profiles").select("status").eq("id", uid).single(),
        supabase.rpc("cuenta_activa"),
      ]);
      if (estado.error || activa.error) throw estado.error ?? activa.error;
      if (estado.data.status !== perfil?.status) await recargar();
      return { estado: estado.data.status, activa: activa.data === true };
    },
  });
  if (!configurado) return <Mensaje texto="Falta configurar Supabase (ver /estado)." />;
  if (cargando) return <Mensaje texto="Cargando…" />;
  if (!session) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (perfil && cuenta.isPending) return <Mensaje texto="Consultando el estado de tu cuenta…" />;
  if (perfil && cuenta.isError) return (
    <main className="mx-auto max-w-xl space-y-3 px-4 py-10">
      <p role="alert">No se pudo consultar el estado de tu cuenta.</p>
      <Boton onClick={() => void cuenta.refetch()}>Reintentar</Boton>
    </main>
  );
  if (cuenta.data && !cuenta.data.activa) {
    const titulo = cuenta.data.estado === "bloqueado" ? "Cuenta bloqueada"
      : cuenta.data.estado === "suspendido" ? "Cuenta suspendida" : "Cuenta restringida";
    return (
      <main className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold text-pino">{titulo}</h1>
        <p className="text-suave">Tus operaciones están deshabilitadas. Revisa el motivo y envía una apelación a administración.</p>
        <ListaCasos rol="comprador" clase="sancion" soloVigentes />
        <Boton variante="contorno" onClick={() => void cerrarSesion()}>Cerrar sesión</Boton>
      </main>
    );
  }
  return <Outlet />;
}

export function RequiereAdmin() {
  const { cargando, perfil } = useAuth();
  if (cargando) return <Mensaje texto="Cargando…" />;
  if (!perfil?.is_admin || perfil.status !== "activo") {
    return (
      <main className="mx-auto max-w-xl px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-extrabold text-pino">Acceso restringido</h1>
        <p className="mt-2 text-suave">Esta zona es solo para la administración de Mercado Extra.</p>
      </main>
    );
  }
  return <Outlet />;
}
