import type { InputHTMLAttributes, ReactNode } from "react";

type Props = { etiqueta: string; ayuda?: string; error?: string; children?: ReactNode } & InputHTMLAttributes<HTMLInputElement>;

export const estiloInput =
  "w-full min-h-11 rounded-lg border border-borde bg-white px-3 py-2 text-base text-tinta placeholder:text-suave/70";

export default function Campo({ etiqueta, ayuda, error, id, children, ...rest }: Props) {
  const campoId = id ?? `campo-${etiqueta.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <label htmlFor={campoId} className="block font-bold">{etiqueta}</label>
      {children ?? <input id={campoId} className={estiloInput} aria-invalid={Boolean(error)} {...rest} />}
      {ayuda && !error && <p className="text-sm text-suave">{ayuda}</p>}
      {error && <p className="text-sm font-semibold text-error">{error}</p>}
    </div>
  );
}
