import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { esTelefonoValido } from "@/lib/validaciones";

export default function EditarTelefono() {
  const { perfil, recargar } = useAuth();
  const [telefono, setTelefono] = useState(perfil?.phone ?? "");
  const valido = esTelefonoValido(telefono);
  const guardar = useMutation({
    mutationFn: async () => {
      if (!supabase || !perfil || !valido) throw new Error("Revisa el número de celular.");
      const { data, error } = await supabase.from("profiles")
        .update({ phone: telefono.trim() || null }).eq("id", perfil.id).select("id").single();
      if (error || !data) throw new Error("No se pudo guardar tu celular.");
      await recargar();
    },
  });

  return (
    <form className="space-y-3 rounded-xl border border-borde bg-white p-4" onSubmit={(e) => {
      e.preventDefault();
      if (valido && !guardar.isPending) guardar.mutate();
    }}>
      <Campo etiqueta="Celular" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={9}
        ayuda="Opcional. Ingresa 9 dígitos empezando con 9." value={telefono}
        onChange={(e) => { setTelefono(e.target.value); guardar.reset(); }} disabled={guardar.isPending} />
      <Boton type="submit" disabled={!valido || guardar.isPending || telefono.trim() === (perfil?.phone ?? "")}>Guardar celular</Boton>
      {guardar.isSuccess && <p role="status" className="text-sm text-pino">Celular actualizado.</p>}
      {guardar.isError && <p role="alert" className="text-sm text-error">{guardar.error.message}</p>}
    </form>
  );
}
