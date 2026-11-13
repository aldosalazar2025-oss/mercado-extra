import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { useNoLeidas } from "./hooks";

export default function Campana({ alNavegar }: { alNavegar?: () => void }) {
  const { session } = useAuth();
  const { data } = useNoLeidas();
  if (!session) return null;
  const n = data ?? 0;
  return (
    <Link
      to="/notificaciones"
      onClick={alNavegar}
      aria-label={n > 0 ? `Notificaciones, ${n} sin leer` : "Notificaciones"}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hoja"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {n > 0 && (
        <span className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-maiz px-1 text-center text-xs font-extrabold text-tinta">{n > 9 ? "9+" : n}</span>
      )}
    </Link>
  );
}
