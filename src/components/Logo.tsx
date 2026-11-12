export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="4" y="20" width="40" height="24" rx="4" fill="#E3F0E8" />
      <path d="M4 20 9 6h30l5 14Z" fill="#1E6B45" />
      <path d="M14 6h5l-1.67 14h-6.66ZM24 6h5l1.67 14H24ZM34 6h5l5 14h-6.67Z" fill="#F2B705" />
      <path d="M22 26h4v12h-4Z" fill="#0F3D2A" />
      <path d="M18 30h12v4H18Z" fill="#0F3D2A" />
    </svg>
  );
}

export default function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className={`font-display text-xl font-extrabold tracking-tight ${claro ? "text-white" : "text-pino"}`}>Mercado Extra</span>
    </span>
  );
}
