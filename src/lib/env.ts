// Solo variables VITE_ (publicas). La service_role jamas debe estar aqui.
const limpiar = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.includes("TU-PROYECTO") || s.includes("TU_ANON_KEY") ? "" : s;
};

export const env = {
  supabaseUrl: limpiar(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: limpiar(import.meta.env.VITE_SUPABASE_ANON_KEY),
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
