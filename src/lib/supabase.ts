import { createClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

// Si faltan las variables, no se crea el cliente y la app muestra instrucciones.
export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
