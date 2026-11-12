import Boton from "@/components/Boton";

export default function Ingresar() {
  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-14 text-center">
      <h1 className="font-display text-3xl font-extrabold text-pino">Ingresar</h1>
      <p className="text-suave">Entrarás con tu cuenta de Google. No necesitas crear contraseña.</p>
      <Boton variante="secundario" className="w-full" disabled>Continuar con Google</Boton>
      <p className="text-sm text-suave">Vista previa del diseño: el inicio de sesión se activa en la Etapa 5.</p>
    </main>
  );
}
