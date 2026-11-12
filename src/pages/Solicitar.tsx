import { useState } from "react";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { categorias } from "@/lib/demoData";

export default function Solicitar() {
  const [nombre, setNombre] = useState("");
  const [presupuesto, setPresupuesto] = useState("");
  const [enviado, setEnviado] = useState(false);
  const errorNombre = enviado && !nombre.trim() ? "Escribe qué producto necesitas." : undefined;
  const errorPresupuesto = enviado && !(Number(presupuesto) > 0) ? "Indica un presupuesto máximo mayor que cero." : undefined;
  const completo = nombre.trim() && Number(presupuesto) > 0;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Publicar una solicitud</h1>
      <p className="text-suave">Cuéntanos qué buscas. Tu solicitud estará abierta 24 horas y solo la verán tiendas relacionadas.</p>
      <form className="space-y-4 rounded-xl border border-borde bg-white p-5" onSubmit={(e) => { e.preventDefault(); setEnviado(true); }} noValidate>
        <Campo etiqueta="Producto que necesitas" placeholder="Ej.: saco negro" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errorNombre} />
        <Campo etiqueta="Descripción" id="descripcion">
          <textarea id="descripcion" rows={3} className={estiloInput} placeholder="Talla, color, modelo u otros detalles" />
        </Campo>
        <Campo etiqueta="Categoría" id="categoria">
          <select id="categoria" className={estiloInput} defaultValue="">
            <option value="" disabled>Elige una categoría</option>
            {categorias.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Presupuesto máximo (S/)" type="number" min={0} inputMode="decimal" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} error={errorPresupuesto} />
        <label className="flex min-h-11 items-center gap-3 font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-[#1e6b45]" /> Mi presupuesto es negociable
        </label>
        <Campo etiqueta="Fotos de referencia" type="file" accept="image/*" multiple ayuda="Opcional. Puedes subir varias imágenes." />
        <Boton type="submit" variante="primario">Publicar solicitud</Boton>
        {enviado && completo && (
          <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">Vista previa del diseño: guardar y enviar solicitudes se activa en la Etapa 8.</p>
        )}
      </form>
    </main>
  );
}
