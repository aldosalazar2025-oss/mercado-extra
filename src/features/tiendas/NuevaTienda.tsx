import { Link, useNavigate } from "react-router-dom";
import FormularioTienda from "./FormularioTienda";

export default function NuevaTienda() {
  const ir = useNavigate();
  return (
    <div className="space-y-4">
      <p><Link to="/vendedor/mis-tiendas" className="font-bold text-mercado underline">← Mis tiendas</Link></p>
      <h2 className="font-display text-2xl font-extrabold">Registrar una tienda</h2>
      <p className="text-suave">Tu tienda quedará pendiente hasta que la administración la apruebe. Mientras tanto puedes preparar tus productos.</p>
      <FormularioTienda onGuardado={(id) => ir(`/vendedor/mis-tiendas/${id}`, { replace: true })} />
    </div>
  );
}
