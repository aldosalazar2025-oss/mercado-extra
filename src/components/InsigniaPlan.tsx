import type { MedallaPlan } from "@/features/monetizacion/datos";

const estilos: Record<MedallaPlan, string> = {
  bronce: "border-orange-300 bg-orange-200 text-orange-950",
  plata: "border-slate-400 bg-slate-200 text-slate-900",
  oro: "border-amber-500 bg-amber-300 text-amber-950",
};

export default function InsigniaPlan({ medalla }: { medalla: MedallaPlan }) {
  const etiqueta = `Medalla comercial ${medalla}`;

  return (
    <span role="img" aria-label={etiqueta} title={etiqueta}
      className={`ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border align-middle text-xs font-extrabold leading-none ${estilos[medalla]}`}>
      <span aria-hidden="true">✓</span>
    </span>
  );
}
