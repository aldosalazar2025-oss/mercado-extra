// Solo variables VITE_ (publicas). La service_role jamas debe estar aqui.
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "",
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
