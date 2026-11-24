import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { urlPublica } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

type Foto = { referencia: string; logo_path: string | null; foto_url: string | null; tienda_publica: boolean };

export function useFotosContraparte(contexto: "pedido" | "chat", ids: string[]) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["fotos-contraparte", session?.user.id, contexto, ids],
    enabled: Boolean(session && supabase && ids.length),
    queryFn: async () => {
      const fotos = new Map<string, { url: string | null; tiendaPublica: boolean }>();
      for (let i = 0; i < ids.length; i += 500) {
        const { data, error } = await supabase!.rpc("fotos_contraparte", { p_contexto: contexto, p_ids: ids.slice(i, i + 500) });
        if (error) throw error;
        (data as Foto[]).forEach((f) => fotos.set(f.referencia, {
          url: f.foto_url ?? urlPublica(f.logo_path), tiendaPublica: f.tienda_publica,
        }));
      }
      return fotos;
    },
  });
}

export default function FotoContraparte({ nombre, url, className }: { nombre: string; url?: string | null; className: string }) {
  const [fotoConError, setFotoConError] = useState<string>();
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-borde bg-hoja font-bold text-pino ${className}`}>
      {nombre.trim().charAt(0).toUpperCase() || "?"}
      {url && url !== fotoConError && <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer"
        className="absolute inset-0 size-full object-cover" onError={() => setFotoConError(url)} />}
    </span>
  );
}
