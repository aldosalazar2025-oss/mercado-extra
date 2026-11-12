import { Link, NavLink, useParams } from "react-router-dom";
import AdminVerificaciones from "@/features/identidad/AdminVerificaciones";
import { paneles, slug, type PanelId } from "./config";

const resumenDemo = [
  { etiqueta: "Solicitudes abiertas", valor: "3" },
  { etiqueta: "Ofertas nuevas", valor: "7" },
  { etiqueta: "Compras completadas", valor: "12" },
];

export default function Panel({ panel }: { panel: PanelId }) {
  const { titulo, secciones } = paneles[panel];
  const { seccion } = useParams();
  const actual = secciones.find((s) => slug(s) === seccion) ?? secciones[0];
  const esResumen = actual === secciones[0];

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

      <main className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold text-pino">{actual}</h1>
        {esResumen && (
          <ul className="grid gap-3 sm:grid-cols-3">
            {resumenDemo.map((r) => (
              <li key={r.etiqueta} className="rounded-xl border border-borde bg-white p-4">
                <p className="text-3xl font-extrabold text-pino">{r.valor}</p>
                <p className="text-sm text-suave">{r.etiqueta}</p>
              </li>
            ))}
          </ul>
        )}
        {panel === "admin" && actual === "Verificación de identidad" ? (
          <AdminVerificaciones />
        ) : (
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
