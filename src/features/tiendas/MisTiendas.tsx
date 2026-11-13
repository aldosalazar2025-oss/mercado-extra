import { Link } from "react-router-dom";
import { clasesBoton } from "@/components/Boton";
import Insignia from "./Insignia";
import { useMisTiendas, urlLogo } from "./hooks";

export default function MisTiendas({ modo = "tiendas" }: { modo?: "tiendas" | "empleados" }) {
  const { data, isLoading, error } = useMisTiendas();

  return (
    <div className="space-y-4">
      {modo === "tiendas" && (
        <div>
          <Link to="/vendedor/mis-tiendas/nueva" className={clasesBoton("primario")}>Registrar una tienda</Link>
          <p className="mt-2 text-sm text-suave">Puedes registrar varias tiendas con la misma cuenta. Cada una tiene sus propios productos, pedidos y empleados. Una tienda recibe solicitudes cuando el administrador la aprueba.</p>
        </div>
      )}
      {modo === "empleados" && <p className="text-suave">Elige una tienda para invitar empleados y definir qué puede hacer cada uno.</p>}
      {isLoading && <p className="text-suave">Cargando…</p>}
      {error && <p role="alert" className="text-error">No se pudieron cargar tus tiendas.</p>}
      {data?.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">Aún no tienes tiendas. Registra la primera para empezar a vender.</p>}
      <ul className="space-y-3">
        {data?.map((t) => {
          const logo = urlLogo(t.logo_path);
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-borde bg-white p-4">
              {logo ? (
                <img src={logo} alt="" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-mercado font-display text-2xl font-extrabold text-white" aria-hidden="true">{t.name.charAt(0)}</div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-display text-lg font-bold">{t.name}</p>
                <Insignia estado={t.status} />
                <p className="text-sm text-suave">Tu rol: {t.miRol.replace(/_/g, " ")}</p>
              </div>
              <Link to={`/vendedor/mis-tiendas/${t.id}${modo === "empleados" ? "?tab=empleados" : ""}`} className={clasesBoton("contorno")}>
                {modo === "empleados" ? "Empleados" : "Administrar"}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
