import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Boton from "@/components/Boton";
import Campo from "@/components/Campo";
import { useAuth } from "@/features/auth/AuthContext";
import { comprimirImagen } from "@/lib/imagen";
import { supabase } from "@/lib/supabase";
import { esDniValido, esNombreValido, esTelefonoValido } from "@/lib/validaciones";

type Errores = Partial<Record<"nombre" | "dni" | "telefono" | "fotoDni" | "selfie" | "consentimiento", string>>;

export default function Registro() {
  const { session, perfil, verificacion, recargar } = useAuth();
  const ir = useNavigate();
  const [nombre, setNombre] = useState(perfil?.full_name ?? "");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState(perfil?.phone ?? "");
  const [fotoDni, setFotoDni] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [consiento, setConsiento] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (verificacion && verificacion.status !== "rechazado") {
    return (
      <main className="mx-auto max-w-xl space-y-3 px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-extrabold text-pino">Tu registro ya fue enviado</h1>
        <Link to="/cuenta" className="font-bold text-mercado underline">Ver el estado de mi verificación</Link>
      </main>
    );
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorGeneral(null);
    const nuevos: Errores = {};
    if (!esNombreValido(nombre)) nuevos.nombre = "Escribe tus nombres y apellidos completos.";
    if (!esDniValido(dni)) nuevos.dni = "El DNI tiene 8 números.";
    if (!esTelefonoValido(telefono)) nuevos.telefono = "Escribe un celular de 9 dígitos que empiece con 9, o déjalo vacío.";
    if (!fotoDni) nuevos.fotoDni = "Sube una foto clara del frente de tu DNI.";
    if (!selfie) nuevos.selfie = "Sube una selfie de tu rostro.";
    if (!consiento) nuevos.consentimiento = "Necesitamos tu consentimiento para tratar tus datos.";
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0 || !supabase || !session || !fotoDni || !selfie) return;

    setEnviando(true);
    const uid = session.user.id;
    const marca = Date.now();
    const rutaDni = `${uid}/dni-${marca}.jpg`;
    const rutaSelfie = `${uid}/selfie-${marca}.jpg`;
    try {
      const [blobDni, blobSelfie] = await Promise.all([comprimirImagen(fotoDni), comprimirImagen(selfie)]);
      const bucket = supabase.storage.from("identity-private");
      const s1 = await bucket.upload(rutaDni, blobDni, { contentType: "image/jpeg" });
      if (s1.error) throw new Error("No se pudo subir la foto del DNI.");
      const s2 = await bucket.upload(rutaSelfie, blobSelfie, { contentType: "image/jpeg" });
      if (s2.error) {
        await bucket.remove([rutaDni]);
        throw new Error("No se pudo subir la selfie.");
      }

      const datos = {
        dni: dni.trim(),
        dni_photo_path: rutaDni,
        selfie_path: rutaSelfie,
        status: "pendiente",
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date().toISOString(),
      };
      const guardado = verificacion
        ? await supabase.from("identity_verifications").update(datos).eq("user_id", uid)
        : await supabase.from("identity_verifications").insert({ ...datos, user_id: uid });
      if (guardado.error) {
        await bucket.remove([rutaDni, rutaSelfie]);
        if (guardado.error.code === "23505") {
          throw new Error("Este DNI ya está registrado en otra cuenta. Si crees que es un error, escríbenos para ayudarte.");
        }
        throw new Error("No se pudo guardar tu registro. Inténtalo de nuevo.");
      }

      await supabase
        .from("profiles")
        .update({ full_name: nombre.trim(), phone: telefono.trim() || null, consent_accepted_at: new Date().toISOString() })
        .eq("id", uid);
      await recargar();
      ir("/cuenta", { replace: true });
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : "Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-pino">Completa tu registro</h1>
      <p className="text-suave">
        Verificamos la identidad de compradores y vendedores para que todos compren y vendan con confianza. Mientras revisamos tus datos puedes seguir usando Mercado Extra.
      </p>
      {verificacion?.status === "rechazado" && (
        <p role="alert" className="rounded-lg border border-error/40 bg-white p-3 text-sm">
          <strong>Tu envío anterior fue rechazado.</strong> Motivo: {verificacion.rejection_reason ?? "sin detalle"}. Corrige y vuelve a enviar.
        </p>
      )}
      <form onSubmit={enviar} className="space-y-4 rounded-xl border border-borde bg-white p-5" noValidate>
        <Campo etiqueta="Nombres y apellidos" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" error={errores.nombre} />
        <Campo etiqueta="Número de DNI" inputMode="numeric" maxLength={8} value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))} error={errores.dni} />
        <Campo etiqueta="Celular (opcional)" inputMode="tel" maxLength={9} value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ""))} error={errores.telefono} />
        <Campo etiqueta="Foto del frente de tu DNI" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setFotoDni(e.target.files?.[0] ?? null)} ayuda="Que se lea bien, sin reflejos." error={errores.fotoDni} />
        <Campo etiqueta="Selfie de tu rostro" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} ayuda="De frente, con buena luz y sin lentes oscuros." error={errores.selfie} />
        <div>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[#1e6b45]" checked={consiento} onChange={(e) => setConsiento(e.target.checked)} />
            <span>
              Acepto que Mercado Extra trate mi DNI y mis fotos solo para verificar mi identidad, según la{" "}
              <Link to="/privacidad" className="font-bold text-mercado underline" target="_blank">política de privacidad</Link>.
            </span>
          </label>
          {errores.consentimiento && <p className="mt-1 text-sm font-semibold text-error">{errores.consentimiento}</p>}
        </div>
        {errorGeneral && <p role="alert" className="text-sm font-semibold text-error">{errorGeneral}</p>}
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? "Enviando…" : "Enviar registro"}</Boton>
      </form>
    </main>
  );
}
