import { Link } from "react-router-dom";
import Demo from "@/components/Demo";
import { clasesBoton } from "@/components/Boton";
import TarjetaProducto from "@/components/TarjetaProducto";
import TarjetaTienda from "@/components/TarjetaTienda";
import { productos, tiendas } from "@/lib/demoData";

const pasos = [
  { t: "Publicas lo que necesitas", d: "Describe el producto, sube fotos de referencia y fija tu presupuesto máximo." },
  { t: "Las tiendas indicadas te ofrecen", d: "Solo reciben tu solicitud las tiendas que venden algo relacionado." },
  { t: "Comparas y eliges", d: "Mira precios, condiciones y reputación, y conversa por chat con la tienda que elijas." },
  { t: "Recibes con código seguro", d: "Das un código de seis dígitos al recibir el producto. Así queda confirmada la entrega." },
];

export default function Inicio() {
  return (
    <>
      <section className="bg-pino text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-16">
          <div className="space-y-5">
            <h1 className="font-display text-4xl font-extrabold leading-tight md:text-5xl">Dime qué necesitas. Las tiendas compiten por ofrecértelo.</h1>
            <p className="max-w-prose text-lg text-white/85">Publica tu solicitud gratis. Te responden las tiendas que sí venden eso y tú eliges la mejor oferta.</p>
            <div className="flex flex-wrap gap-3">
              <Link to="/solicitar" className={clasesBoton("primario")}>Publicar una solicitud</Link>
              <Link to="/productos" className={clasesBoton("contornoClaro")}>Explorar productos</Link>
            </div>
          </div>
          <Demo />
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14">
        <h2 className="font-display text-3xl font-extrabold text-pino">Cómo funciona</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {pasos.map((p, i) => (
            <li key={p.t} className="space-y-2 border-l-4 border-maiz bg-white p-4">
              <p className="font-display text-sm font-bold text-mercado">Paso {i + 1}</p>
              <h3 className="font-display text-lg font-bold leading-snug">{p.t}</h3>
              <p className="text-suave">{p.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-extrabold text-pino">Productos cerca de ti</h2>
          <Link to="/productos" className="font-bold text-mercado underline">Ver todos</Link>
        </div>
        <p className="mt-1 text-sm text-suave">Datos de ejemplo para el diseño.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {productos.slice(0, 3).map((p) => <TarjetaProducto key={p.id} p={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <h2 className="font-display text-3xl font-extrabold text-pino">Tiendas afiliadas</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {tiendas.slice(0, 2).map((t) => <TarjetaTienda key={t.id} t={t} />)}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4">
        <div className="flex flex-col gap-4 rounded-2xl bg-maiz p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-2xl font-extrabold">¿Tienes una tienda? Vende sin comisión.</h2>
            <p className="mt-1 max-w-prose">Registra una o varias tiendas gratis, recibe solicitudes de compradores y envía tus ofertas.</p>
          </div>
          <Link to="/ingresar" className={clasesBoton("secundario")}>Registrar mi tienda</Link>
        </div>
      </section>
    </>
  );
}
