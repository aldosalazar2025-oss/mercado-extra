import { useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";

export default function FotoPerfil({ className = "" }: { className?: string }) {
  const { session, perfil } = useAuth();
  const metadatos = session?.user.user_metadata;
  const foto = [metadatos?.avatar_url, metadatos?.picture].find(
    (valor): valor is string => typeof valor === "string" && valor.startsWith("https://"),
  );
  const [fotoConError, setFotoConError] = useState<string>();
  const nombre = perfil?.full_name?.trim() || session?.user.email || "";
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-hoja font-bold text-pino ${className}`}>
      {nombre.charAt(0).toUpperCase() || "?"}
      {foto && fotoConError !== foto && <img src={foto} alt="" referrerPolicy="no-referrer"
        onError={() => setFotoConError(foto)} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  );
}
