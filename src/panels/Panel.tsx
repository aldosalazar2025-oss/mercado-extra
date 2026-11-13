import type { ReactNode } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import AdminVerificaciones from "@/features/identidad/AdminVerificaciones";
import AdminTiendas from "@/features/tiendas/AdminTiendas";
import MisTiendas from "@/features/tiendas/MisTiendas";
import { useMisPermisos } from "@/features/tiendas/hooks";
import { paneles, permisoSeccion, slug, type PanelId } from "./config";

const resumenDemo = [
  { etiqueta: "Solicitudes abiertas", valor: "3" },
  { etiqueta: "Ofertas nuevas", valor: "7" },
  { etiqueta: "Compras completadas", valor: "12" },
];

function contenidoDe(panel: PanelId, seccion: string): ReactNode | null {
  if (panel === "admin" && seccion === "Verificación de identidad") return <AdminVerificaciones />;
  if (panel === "admin" && seccion === "Tiendas") return <AdminTiendas />;
  if (panel === "vendedor" && seccion === "Mis tiendas") return <MisTiendas />;
  if (panel === "vendedor" && seccion === "Empleados y permisos") return <MisTiendas modo="empleados" />;
  return null;
}

type Props = { panel: PanelId; seccion?: string; contenido?: ReactNode };

export default function Panel({ panel, seccion: seccionFija, contenido }: Props) {
  const { titulo, secciones: todas } = paneles[panel];
  const { seccion } = useParams();
  const misPermisos = useMisPermisos(panel === "vendedor");
  // En el panel de vendedor el menú solo muestra lo que la persona puede usar en alguna de sus tiendas.
  const visibles = (s: string) => {
    if (panel !== "vendedor") return true;
    const req = permisoSeccion[s] ?? null;
    return req === null || (misPermisos.data?.has(req) ?? false);
  };
  const secciones = todas.filter(visibles);
  const pedida = seccionFija ?? todas.find((s) => slug(s) === seccion) ?? todas[0];
  const sinAcceso = panel === "vendedor" && !misPermisos.isLoading && !visibles(pedida);
  const actual = pedida;
  const esResumen = !contenido && actual === todas[0];
  const real = sinAcceso ? (
    <p className="rounded-xl bg-white p-6 text-suave">Tu rol en tus tiendas no incluye esta sección. Si la necesitas, pídele al propietario que te dé el permiso.</p>
  ) : (
    contenido ?? contenidoDe(panel, actual)
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[240px_1fr]">
      <nav aria-label={titulo} className="md:sticky md:top-20 md:self-start">
        <p className="mb-2 font-display text-lg font-extrabold text-pino">{titulo}</p>
        <ul className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:gap-1 md:overflow-visible">
          {secciones.map((s) => (
            <li key={s} className="shrink-0">
              <NavLink
                to={`/${panel}/${slug(s)}`}
                className={() => `block whitespace-nowrap rounded-lg px-3 py-2 font-bold ${s === actual ? "bg-mercado text-white" : "bg-white text-tinta hover:bg-hoja"}`}
                aria-current={s === actual ? "page" : undefined}
              >
                {s}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="min-w-0 space-y-4">
        <h1 className="font-display text-3xl font-extrabold text-pino">{actual}</h1>
        {esResumen && (
          <ul className="grid gap-3 sm:grid-cols-3">
            {resumenDemo.map((r) => (
              <li key={r.etiqueta} className="rounded-xl border border-borde bg-white p-4">
                <p className="text-3xl font-extrabold text-pino">{r.valor}</p>
                <p className="text-sm text-suave">{r.etiqueta} (ejemplo)</p>
              </li>
            ))}
          </ul>
        )}
        {real ?? (
          <p className="rounded-xl bg-white p-6 text-suave">
            Vista previa del diseño con datos de ejemplo. Esta sección se vuelve funcional en una etapa posterior.
          </p>
        )}
        <p className="text-sm">
          <Link to="/" className="font-bold text-mercado underline">Volver al inicio</Link>
        </p>
      </main>
    </div>
  );
}
