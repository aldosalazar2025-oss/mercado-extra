import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthContext";
import { slug } from "@/panels/config";

const indicadores = [
  ["usuarios", "Usuarios registrados", "Usuarios"],
  ["identidades", "Identidades pendientes", "Verificación de identidad"],
  ["tiendas", "Tiendas pendientes", "Tiendas"],
  ["solicitudes", "Solicitudes abiertas o con ofertas", "Solicitudes"],
  ["pedidos", "Pedidos en curso", "Operaciones"],
  ["reclamos", "Reclamos por resolver", "Reclamos"],
  ["cancelaciones", "Cancelaciones denunciadas", "Cancelaciones"],
  ["calificaciones", "Denuncias de calificaciones pendientes", "Reportes"],
] as const;

export default function ResumenAdmin() {
  const { session } = useAuth();
  const consulta = useQuery({
    queryKey: ["admin", session?.user.id, "resumen"],
    queryFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.rpc("admin_resumen");
      if (error) throw error;
      return data as Record<(typeof indicadores)[number][0], number>;
    },
  });
  if (consulta.isPending) return <p className="text-suave">Cargando resumen…</p>;
  if (consulta.isError) return <p role="alert" className="text-error">No se pudo cargar el resumen administrativo.</p>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {indicadores.map(([clave, titulo, seccion]) => (
        <li key={clave}>
          <Link to={`/admin/${slug(seccion)}`} className="block h-full rounded-xl border border-borde bg-white p-4 hover:border-mercado">
            <p className="text-3xl font-extrabold text-pino">{consulta.data[clave].toLocaleString("es-PE")}</p>
            <p className="mt-1 text-sm font-bold">{titulo}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
