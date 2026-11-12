import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { estiloInput } from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import { supabase } from "@/lib/supabase";

type Fila = {
  id: string;
  user_id: string;
  dni: string;
  dni_photo_path: string | null;
  selfie_path: string | null;
  status: "pendiente" | "verificado" | "rechazado";
  rejection_reason: string | null;
  submitted_at: string;
  profiles: { full_name: string; email: string | null; phone: string | null } | null;
};

export default function AdminVerificaciones() {
  const { session } = useAuth();
  const cliente = useQueryClient();
  const [filtro, setFiltro] = useState<"pendiente" | "verificado" | "rechazado">("pendiente");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [urls, setUrls] = useState<{ dni: string | null; selfie: string | null } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["verificaciones", filtro],
    queryFn: async (): Promise<Fila[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("identity_verifications")
        .select("id,user_id,dni,dni_photo_path,selfie_path,status,rejection_reason,submitted_at,profiles:user_id(full_name,email,phone)")
        .eq("status", filtro)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  async function verDocumentos(f: Fila) {
    if (!supabase) return;
    setMensaje(null);
    setUrls(null);
    // Primero se registra el acceso; si falla el registro, no se muestran los documentos.
    const log = await supabase.rpc("registrar_auditoria", {
      p_action: "ver_documentos_identidad",
      p_entity: "identity_verifications",
      p_entity_id: f.id,
      p_metadata: {},
    });
    if (log.error) {
      setMensaje("No se pudo registrar el acceso, por seguridad no se abrieron los documentos.");
      return;
    }
    const bucket = supabase.storage.from("identity-private");
    const [a, b] = await Promise.all([
      f.dni_photo_path ? bucket.createSignedUrl(f.dni_photo_path, 120) : Promise.resolve(null),
      f.selfie_path ? bucket.createSignedUrl(f.selfie_path, 120) : Promise.resolve(null),
    ]);
    setUrls({ dni: a?.data?.signedUrl ?? null, selfie: b?.data?.signedUrl ?? null });
    setAbierta(f.id);
  }

  const resolver = useMutation({
    mutationFn: async (p: { fila: Fila; aprobar: boolean }) => {
      if (!supabase || !session) throw new Error("Sin sesión");
      if (!p.aprobar && motivo.trim().length < 5) throw new Error("Escribe el motivo del rechazo (mínimo 5 caracteres).");
      const { error } = await supabase
        .from("identity_verifications")
        .update({
          status: p.aprobar ? "verificado" : "rechazado",
          rejection_reason: p.aprobar ? null : motivo.trim(),
          reviewed_by: session.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", p.fila.id);
      if (error) throw error;
      await supabase.rpc("registrar_auditoria", {
        p_action: p.aprobar ? "verificar_identidad" : "rechazar_identidad",
        p_entity: "identity_verifications",
        p_entity_id: p.fila.id,
        p_metadata: p.aprobar ? {} : { motivo: motivo.trim() },
      });
    },
    onSuccess: () => {
      setAbierta(null);
      setUrls(null);
      setMotivo("");
      setMensaje("Listo, el resultado quedó guardado.");
      void cliente.invalidateQueries({ queryKey: ["verificaciones"] });
    },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "No se pudo guardar."),
  });

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <label htmlFor="filtro-estado" className="block font-bold">Estado</label>
        <select id="filtro-estado" className={estiloInput} value={filtro} onChange={(e) => { setFiltro(e.target.value as typeof filtro); setAbierta(null); setUrls(null); }}>
          <option value="pendiente">Pendientes</option>
          <option value="verificado">Verificados</option>
          <option value="rechazado">Rechazados</option>
        </select>
      </div>
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {lista.isLoading && <p className="text-suave">Cargando…</p>}
      {lista.error && <p role="alert" className="text-error">No se pudo cargar la lista.</p>}
      {lista.data?.length === 0 && <p className="rounded-xl bg-white p-6 text-suave">No hay registros en este estado.</p>}

      <ul className="space-y-3">
        {lista.data?.map((f) => (
          <li key={f.id} className="space-y-3 rounded-xl border border-borde bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{f.profiles?.full_name || "Sin nombre"}</p>
                <p className="text-sm text-suave">{f.profiles?.email} · DNI {f.dni}</p>
                <p className="text-sm text-suave">Enviado: {new Date(f.submitted_at).toLocaleString("es-PE")}</p>
                {f.rejection_reason && <p className="text-sm">Motivo previo: {f.rejection_reason}</p>}
              </div>
              <Boton variante="contorno" onClick={() => void verDocumentos(f)}>Ver documentos</Boton>
            </div>

            {abierta === f.id && urls && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {urls.dni ? <img src={urls.dni} alt="Foto del DNI" className="w-full rounded-lg border border-borde" /> : <p>Sin foto del DNI.</p>}
                  {urls.selfie ? <img src={urls.selfie} alt="Selfie" className="w-full rounded-lg border border-borde" /> : <p>Sin selfie.</p>}
                </div>
                <p className="text-sm text-suave">Compara el rostro de la selfie con la foto del DNI y confirma que el número coincide con el declarado.</p>
                <div>
                  <label htmlFor={`motivo-${f.id}`} className="block font-bold">Motivo (solo si rechazas)</label>
                  <textarea id={`motivo-${f.id}`} rows={2} className={estiloInput} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Boton variante="secundario" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, aprobar: true })}>Verificar identidad</Boton>
                  <Boton variante="contorno" disabled={resolver.isPending} onClick={() => resolver.mutate({ fila: f, aprobar: false })}>Rechazar</Boton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
