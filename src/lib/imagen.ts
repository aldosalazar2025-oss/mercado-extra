const MAX_ENTRADA = 15 * 1024 * 1024; // 15 MB antes de comprimir
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

// Valida y comprime una foto a JPEG (máx. 1600 px de lado) para ahorrar datos y almacenamiento.
export async function comprimirImagen(archivo: File, maxLado = 1600, calidad = 0.82): Promise<Blob> {
  if (!TIPOS.includes(archivo.type)) throw new Error("Usa una foto JPG, PNG o WEBP.");
  if (archivo.size > MAX_ENTRADA) throw new Error("La foto pesa demasiado (máximo 15 MB).");

  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la foto.");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
  if (!blob) throw new Error("No se pudo preparar la foto.");
  return blob;
}
