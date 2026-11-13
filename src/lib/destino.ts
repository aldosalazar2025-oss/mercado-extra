// Recuerda a qué página volver después de iniciar sesión con Google (solo rutas internas).
const CLAVE = "volverA";

export function guardarDestino(ruta: string | undefined | null) {
  if (ruta && ruta.startsWith("/") && !ruta.startsWith("//")) sessionStorage.setItem(CLAVE, ruta);
}

export function tomarDestino(): string | null {
  const r = sessionStorage.getItem(CLAVE);
  sessionStorage.removeItem(CLAVE);
  return r && r.startsWith("/") && !r.startsWith("//") ? r : null;
}
