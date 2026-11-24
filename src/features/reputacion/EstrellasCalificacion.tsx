export default function EstrellasCalificacion({ puntuacion }: { puntuacion: number }) {
  return (
    <span role="img" aria-label={`${puntuacion.toLocaleString("es-PE")} de 5 estrellas`} className="inline-flex gap-0.5 text-lg leading-none">
      {[1, 2, 3, 4, 5].map((estrella) => (
        <span key={estrella} aria-hidden="true" className="relative text-slate-400">
          ★
          <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-500"
            style={{ width: `${Math.min(1, Math.max(0, puntuacion - estrella + 1)) * 100}%` }}>★</span>
        </span>
      ))}
    </span>
  );
}
