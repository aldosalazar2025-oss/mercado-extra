import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function Pie() {
  return (
    <footer className="mt-16 bg-pino text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div className="space-y-2">
          <Logo claro />
          <p className="text-white/80">Publica lo que necesitas y deja que las tiendas compitan por ofrecértelo.</p>
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-bold">Para compradores</h2>
          <p className="text-white/80">Buscar, publicar solicitudes, recibir ofertas y reclamar son siempre gratis.</p>
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-bold">Para tiendas</h2>
          <p className="text-white/80">Sin comisión por ventas. Los pagos se acuerdan directamente con el comprador.</p>
          <Link to="/estado" className="inline-block text-sm text-maiz underline">Estado del sistema</Link>
        </div>
      </div>
    </footer>
  );
}
