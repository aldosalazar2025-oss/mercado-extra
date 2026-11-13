import { supabase } from "./supabase";

// URL pública de una imagen del catálogo (bucket público "public-catalog").
export function urlPublica(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from("public-catalog").getPublicUrl(path).data.publicUrl;
}
