import { useQuery } from "@tanstack/react-query";
import { env, isSupabaseConfigured } from "@/lib/env";

type Resultado = { ok: boolean; googleActivo: boolean | null; detalle: string };

// Consulta publica de Supabase Auth: confirma URL + anon key y si Google esta activado.
async function comprobar(): Promise<Resultado> {
  const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: env.supabaseAnonKey },
  });
  if (!res.ok) {
    return { ok: false, googleActivo: null, detalle: `Supabase respondio ${res.status}. Revisa la URL y la anon key.` };
  }
  const data = (await res.json()) as { external?: { google?: boolean } };
  return { ok: true, googleActivo: data.external?.google ?? false, detalle: "Conexion correcta." };
}

export default function EstadoConexion() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["estado-conexion"],
    queryFn: comprobar,
    enabled: isSupabaseConfigured,
    retry: false,
  });

  if (!isSupabaseConfigured) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Copia{" "}
        <code>.env.example</code> como <code>.env.local</code> y completa los valores.
      </p>
    );
  }
  if (isLoading) return <p className="text-sm text-slate-600">Comprobando conexion con Supabase...</p>;
  if (error || !data) {
    return <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">No se pudo conectar con Supabase. Revisa tu internet y la URL.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      <li className={data.ok ? "text-green-700" : "text-red-700"}>{data.ok ? "Supabase conectado" : data.detalle}</li>
      {data.ok && (
        <li className={data.googleActivo ? "text-green-700" : "text-amber-700"}>
          {data.googleActivo ? "Inicio de sesion con Google activado" : "Google aun no esta activado en Supabase (se hace en la Etapa 5)"}
        </li>
      )}
    </ul>
  );
}
