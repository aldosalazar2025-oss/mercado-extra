export type Ubicacion = { lat: number; lng: number };

export function pedirUbicacion(): Promise<Ubicacion> {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) return mal(new Error("Tu navegador no permite obtener la ubicación."));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => mal(new Error("No pudimos obtener tu ubicación. Revisa el permiso del navegador.")),
    );
  });
}

export function distanciaKm(a: Ubicacion, b: Ubicacion): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
