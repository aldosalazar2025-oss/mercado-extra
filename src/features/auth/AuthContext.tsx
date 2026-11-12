import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Perfil = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_admin: boolean;
  is_seller: boolean;
  is_buyer: boolean;
  status: "activo" | "suspendido" | "bloqueado";
  consent_accepted_at: string | null;
};

export type Verificacion = {
  id: string;
  status: "pendiente" | "verificado" | "rechazado";
  rejection_reason: string | null;
  submitted_at: string;
  dni: string;
};

type Contexto = {
  configurado: boolean;
  cargando: boolean;
  session: Session | null;
  perfil: Perfil | null;
  verificacion: Verificacion | null;
  iniciarConGoogle: () => Promise<string | null>;
  cerrarSesion: () => Promise<void>;
  recargar: () => Promise<void>;
};

const AuthContext = createContext<Contexto | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sesionLista, setSesionLista] = useState(!supabase);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [verificacion, setVerificacion] = useState<Verificacion | null>(null);
  const [datosDe, setDatosDe] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSesionLista(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSession(nueva));
    return () => data.subscription.unsubscribe();
  }, []);

  const cargarDatos = useCallback(async (id: string) => {
    if (!supabase) return;
    try {
      const [p, v] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,phone,is_admin,is_seller,is_buyer,status,consent_accepted_at")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("identity_verifications").select("id,status,rejection_reason,submitted_at,dni").eq("user_id", id).maybeSingle(),
      ]);
      setPerfil((p.data as Perfil | null) ?? null);
      setVerificacion((v.data as Verificacion | null) ?? null);
    } finally {
      setDatosDe(id);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setPerfil(null);
      setVerificacion(null);
      setDatosDe(null);
      return;
    }
    void cargarDatos(userId);
  }, [userId, cargarDatos]);

  const iniciarConGoogle = useCallback(async () => {
    if (!supabase) return "Falta configurar Supabase.";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return error ? "No se pudo iniciar con Google. Inténtalo de nuevo." : null;
  }, []);

  const cerrarSesion = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const recargar = useCallback(async () => {
    if (userId) await cargarDatos(userId);
  }, [userId, cargarDatos]);

  const valor = useMemo<Contexto>(
    () => ({
      configurado: Boolean(supabase),
      cargando: !sesionLista || (userId !== null && datosDe !== userId),
      session,
      perfil,
      verificacion,
      iniciarConGoogle,
      cerrarSesion,
      recargar,
    }),
    [sesionLista, userId, datosDe, session, perfil, verificacion, iniciarConGoogle, cerrarSesion, recargar],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): Contexto {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
