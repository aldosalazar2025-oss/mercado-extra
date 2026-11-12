import type { ButtonHTMLAttributes } from "react";

export type Variante = "primario" | "secundario" | "contorno" | "contornoClaro";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const variantes: Record<Variante, string> = {
  primario: "bg-maiz text-tinta hover:bg-[#dca600]",
  secundario: "bg-mercado text-white hover:bg-pino",
  contorno: "border-2 border-mercado text-mercado hover:bg-hoja",
  contornoClaro: "border-2 border-white/70 text-white hover:bg-white/10",
};

export const clasesBoton = (v: Variante = "secundario") => `${base} ${variantes[v]}`;

export default function Boton({ variante = "secundario", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button className={`${clasesBoton(variante)} ${className}`} {...rest} />;
}
