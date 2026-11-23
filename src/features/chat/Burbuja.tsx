import { useFotoChat } from "./hooks";
import { hora, type Mensaje } from "./tipos";

function FotoMensaje({ path, auditoria }: { path: string; auditoria: boolean }) {
  const { data, isLoading } = useFotoChat(path, auditoria);
  if (isLoading) return <div className="h-40 w-56 max-w-full rounded-lg bg-hoja" aria-label="Cargando foto" />;
  if (!data) return <p className="text-sm">Foto no disponible.</p>;
  return (
    <a href={data} target="_blank" rel="noreferrer" aria-label="Abrir la foto en tamaño completo">
      <img src={data} alt="Foto enviada en el chat" className="max-h-64 max-w-full rounded-lg object-cover" loading="lazy" />
    </a>
  );
}

type Props = {
  m: Pick<Mensaje, "body" | "image_path" | "created_at">;
  mio: boolean;
  autor?: string;
  auditoria?: boolean;
};

export default function Burbuja({ m, mio, autor, auditoria = false }: Props) {
  return (
    <li className={`flex ${mio ? "justify-end" : "justify-start"}`}>
      <div className={`min-w-0 max-w-[85%] space-y-1 rounded-2xl px-3 py-2 ${mio ? "rounded-br-sm bg-mercado text-white" : "rounded-bl-sm border border-borde bg-white"}`}>
        {autor && <p className="break-words text-sm font-bold">{autor}</p>}
        {m.image_path && <FotoMensaje path={m.image_path} auditoria={auditoria} />}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <time dateTime={m.created_at} className={`block text-right text-xs ${mio ? "text-white/80" : "text-suave"}`}>
          {auditoria ? new Date(m.created_at).toLocaleString("es-PE") : hora(m.created_at)}
        </time>
      </div>
    </li>
  );
}
