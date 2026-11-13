import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { COLUMNAS_TIENDA, type Tienda } from "./tipos";

export type MiTienda = Tienda & { miRol: string };

// Tiendas donde la persona es propietaria o empleada activa.
export function useMisTiendas() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["mis-tiendas", uid],
    enabled: Boolean(uid && supabase),
    queryFn: async (): Promise<MiTienda[]> => {
      if (!supabase || !uid) return [];
      const m = await supabase.from("store_members").select("store_id,role_code").eq("user_id", uid).eq("status", "activo");
      if (m.error) throw m.error;
      const roles = new Map((m.data ?? []).map((x) => [x.store_id as string, x.role_code as string]));
      if (roles.size === 0) return [];
      const t = await supabase.from("stores").select(COLUMNAS_TIENDA).in("id", [...roles.keys()]).order("name");
      if (t.error) throw t.error;
      return ((t.data ?? []) as Tienda[]).map((s) => ({ ...s, miRol: roles.get(s.id) ?? "" }));
    },
  });
}

// Permisos de la persona en una tienda (solo para mostrar u ocultar botones; la base de datos es la que decide).
export function usePermisosTienda(tiendaId: string | undefined, ownerId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["permisos-tienda", tiendaId, uid],
    enabled: Boolean(uid && tiendaId && supabase),
    queryFn: async () => {
      if (!supabase || !uid || !tiendaId) return { esPropietario: false, permisos: new Set<string>() };
      const esPropietario = ownerId === uid;
      const m = await supabase.from("store_members").select("role_code,extra_permissions,status").eq("store_id", tiendaId).eq("user_id", uid).maybeSingle();
      const permisos = new Set<string>((m.data?.status === "activo" ? (m.data.extra_permissions as string[]) : []) ?? []);
      if (m.data?.status === "activo") {
        const rp = await supabase.from("role_permissions").select("permission_code").eq("role_code", m.data.role_code);
        (rp.data ?? []).forEach((r) => permisos.add(r.permission_code as string));
      }
      if (esPropietario) ["editar_tienda", "gestionar_empleados", "gestionar_productos", "gestionar_planes"].forEach((p) => permisos.add(p));
      return { esPropietario, permisos };
    },
  });
}

export function urlLogo(path: string | null): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from("public-catalog").getPublicUrl(path).data.publicUrl;
}

// Permisos que la persona tiene en CUALQUIERA de sus tiendas (para ordenar el menú del vendedor).
export function useMisPermisos(habilitado: boolean) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["mis-permisos", uid],
    enabled: Boolean(habilitado && uid && supabase),
    queryFn: async () => {
      const permisos = new Set<string>();
      if (!supabase || !uid) return permisos;
      const [m, rp] = await Promise.all([
        supabase.from("store_members").select("role_code,extra_permissions").eq("user_id", uid).eq("status", "activo"),
        supabase.from("role_permissions").select("role_code,permission_code"),
      ]);
      const porRol = new Map<string, string[]>();
      (rp.data ?? []).forEach((x) => porRol.set(x.role_code as string, [...(porRol.get(x.role_code as string) ?? []), x.permission_code as string]));
      (m.data ?? []).forEach((fila) => {
        (porRol.get(fila.role_code as string) ?? []).forEach((p) => permisos.add(p));
        ((fila.extra_permissions as string[]) ?? []).forEach((p) => permisos.add(p));
      });
      return permisos;
    },
  });
}

// Permisos de la persona en cada una de sus tiendas (tienda -> conjunto de permisos).
export function usePermisosPorTienda() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["permisos-por-tienda", uid],
    enabled: Boolean(uid && supabase),
    queryFn: async () => {
      const mapa = new Map<string, Set<string>>();
      if (!supabase || !uid) return mapa;
      const [m, rp] = await Promise.all([
        supabase.from("store_members").select("store_id,role_code,extra_permissions").eq("user_id", uid).eq("status", "activo"),
        supabase.from("role_permissions").select("role_code,permission_code"),
      ]);
      const porRol = new Map<string, string[]>();
      (rp.data ?? []).forEach((x) => porRol.set(x.role_code as string, [...(porRol.get(x.role_code as string) ?? []), x.permission_code as string]));
      (m.data ?? []).forEach((f) => {
        const set = new Set<string>((f.extra_permissions as string[]) ?? []);
        (porRol.get(f.role_code as string) ?? []).forEach((p) => set.add(p));
        mapa.set(f.store_id as string, set);
      });
      return mapa;
    },
  });
}
