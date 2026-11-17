import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { comprimirImagen } from "@/lib/imagen";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useConversaciones, useFotoChat, useMensajes } from "./hooks";
import { etiquetaDia, etiquetaPedido, hora, traducirErrorChat, type Conversacion, type Mensaje } from "./tipos";

type Rol = "comprador" | "vendedor";

function FotoMensaje({ path }: { path: string }) {
  const { data, isLoading } = useFotoChat(path);
  if (isLoading || !data) return <div className="h-40 w-56 rounded-lg bg-hoja" aria-label="Cargando foto" />;
  return (
    <a href={data} target="_blank" rel="noreferrer" aria-label="Abrir la foto en tamaño completo">
      <img src={data} alt="Foto enviada en el chat" className="max-h-64 max-w-full rounded-lg object-cover" loading="lazy" />
    </a>
  );
}

function Burbuja({ m, mio }: { m: Mensaje; mio: boolean }) {
  return (
    <li className={`flex ${mio ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-1 rounded-2xl px-3 py-2 ${mio ? "rounded-br-sm bg-mercado text-white" : "rounded-bl-sm border border-borde bg-white"}`}>
        {m.image_path && <FotoMensaje path={m.image_path} />}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <p className={`text-right text-xs ${mio ? "text-white/80" : "text-suave"}`}>{hora(m.created_at)}</p>
      </div>
    </li>
  );
}

function Compositor({ c, uid, alEnviar }: { c: Conversacion; uid: string; alEnviar: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const cerrada = c.estado === "cerrada";

  async function enviar(cuerpo: { body?: string; image_path?: string }) {
    if (!supabase) return false;
    const r = await supabase.from("messages").insert({ conversation_id: c.conversation_id, sender_id: uid, ...cuerpo });
    if (r.error) {
      setError(traducirErrorChat(r.error.message));
      return false;
    }
    setError(null);
    alEnviar();
    return true;
  }

  async function enviarTexto(e?: FormEvent) {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    if (await enviar({ body: limpio })) setTexto("");
    setEnviando(false);
  }

  function teclas(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviarTexto();
    }
  }

  async function enviarFoto(f: File | undefined) {
    if (!f || !supabase) return;
    setEnviando(true);
    try {
      const blob = await comprimirImagen(f, 1400);
      const ruta = `${c.conversation_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await supabase.storage.from("chat-private").upload(ruta, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error("No se pudo subir la foto.");
      if (!(await enviar({ image_path: ruta }))) await supabase.storage.from("chat-private").remove([ruta]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la foto.");
    } finally {
      setEnviando(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  if (cerrada) return <p className="rounded-xl bg-white p-3 text-center text-sm text-suave">Esta conversación está cerrada. Puedes leer el historial, pero ya no enviar mensajes.</p>;

  return (
    <form onSubmit={enviarTexto} className="space-y-1">
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <div className="flex items-end gap-2">
        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-borde bg-white hover:bg-hoja" title="Enviar una foto">
          <span className="sr-only">Enviar una foto</span>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="m21 16-5-5-8 8" /></svg>
          <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={enviando} onChange={(e) => void enviarFoto(e.target.files?.[0])} />
        </label>
        <textarea
          aria-label="Escribe un mensaje"
          rows={1}
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={teclas}
          placeholder="Escribe un mensaje…"
          className="max-h-32 min-h-11 flex-1 resize-y rounded-lg border border-borde bg-white px-3 py-2"
        />
        <Boton type="submit" variante="primario" disabled={enviando || texto.trim() === ""}>Enviar</Boton>
      </div>
    </form>
  );
}

function Hilo({ c, rol }: { c: Conversacion; rol: Rol }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const cliente = useQueryClient();
  const [limite, setLimite] = useState(100);
  const mensajes = useMensajes(c.conversation_id, limite);
  const datos = mensajes.data ?? [];
  const fin = useRef<HTMLDivElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const cerca = useRef(true);
  const ultimoId = datos[datos.length - 1]?.id;

  // Baja al último mensaje al abrir y cuando llegan nuevos (si ya estabas abajo).
  useLayoutEffect(() => {
    if (cerca.current) fin.current?.scrollIntoView({ block: "end" });
  }, [ultimoId, c.conversation_id]);

  // Marca como leída la conversación abierta.
  useEffect(() => {
    if (!supabase || c.no_leidos === 0 || document.visibilityState !== "visible") return;
    const sb = supabase;
    void sb.rpc("marcar_conversacion_leida", { p_conversation: c.conversation_id }).then(() => {
      void cliente.invalidateQueries({ queryKey: ["chat", "lista"] });
      void cliente.invalidateQueries({ queryKey: ["notificaciones"] });
    });
  }, [c.conversation_id, c.no_leidos, ultimoId, cliente]);

  const otro = rol === "comprador" ? c.tienda : c.comprador || "Comprador";
  let diaAnterior = "";

  return (
    <div className="flex h-[70vh] min-h-[420px] flex-col rounded-xl border border-borde bg-hoja/40">
      <header className="space-y-1 border-b border-borde bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold">{otro}</p>
            <p className="truncate text-sm text-suave">{c.solicitud}</p>
          </div>
          <div className="space-y-1 text-right text-sm">
            {c.estado_pedido && <span className="inline-block rounded-full bg-hoja px-3 py-0.5 font-semibold text-pino">{etiquetaPedido[c.estado_pedido] ?? c.estado_pedido}</span>}
            {c.precio_acordado !== null && <p className="font-bold text-pino">Precio acordado {soles(Number(c.precio_acordado))}</p>}
          </div>
        </div>
        <p className="text-xs text-suave">
          Los pagos se acuerdan directamente entre comprador y vendedor; Mercado Extra no retiene dinero. No compartas contraseñas ni datos de tu banca por aquí.{" "}
          {c.order_id && <><Link to={rol === "comprador" ? `/comprador/mis-compras/${c.order_id}` : `/vendedor/pedidos/${c.order_id}`} className="font-bold text-mercado underline">Ver el pedido</Link>{" · "}</>}
          <Link to={rol === "comprador" ? `/comprador/mis-solicitudes/${c.request_id}/ofertas` : "/vendedor/mis-ofertas"} className="font-bold text-mercado underline">
            {rol === "comprador" ? "Ver la oferta" : "Ver mi oferta"}
          </Link>
        </p>
      </header>

      <div
        ref={contenedor}
        className="flex-1 space-y-3 overflow-y-auto p-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          cerca.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {mensajes.isLoading && <p className="text-center text-suave">Cargando mensajes…</p>}
        {mensajes.error && <p role="alert" className="text-center text-error">No se pudieron cargar los mensajes.</p>}
        {datos.length === limite && <div className="text-center"><Boton variante="contorno" onClick={() => setLimite((x) => x + 100)}>Ver mensajes anteriores</Boton></div>}
        {!mensajes.isLoading && datos.length === 0 && <p className="text-center text-suave">Aún no hay mensajes. Saluda y coordina los detalles de la entrega.</p>}
        <ul className="space-y-2">
          {datos.map((m) => {
            const dia = etiquetaDia(m.created_at);
            const separador = dia !== diaAnterior;
            diaAnterior = dia;
            return (
              <li key={m.id} className="list-none">
                {separador && <p className="my-2 text-center text-xs font-bold uppercase tracking-wide text-suave">{dia}</p>}
                <ul><Burbuja m={m} mio={m.sender_id === uid} /></ul>
              </li>
            );
          })}
        </ul>
        <div ref={fin} />
      </div>

      <div className="border-t border-borde bg-white p-3">
        <Compositor c={c} uid={uid} alEnviar={() => { cerca.current = true; void cliente.invalidateQueries({ queryKey: ["chat"] }); }} />
      </div>
    </div>
  );
}

function ItemConversacion({ c, rol, activa }: { c: Conversacion; rol: Rol; activa: boolean }) {
  const otro = rol === "comprador" ? c.tienda : c.comprador || "Comprador";
  const vista = c.ultimo_texto ?? (c.ultimo_tiene_foto ? "📷 Foto" : "Sin mensajes todavía");
  return (
    <li>
      <Link to={`/${rol}/chat/${c.conversation_id}`} aria-current={activa ? "page" : undefined}
        className={`block space-y-0.5 rounded-xl border p-3 ${activa ? "border-mercado bg-hoja" : "border-borde bg-white hover:bg-hoja"}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-bold">{otro}</p>
          <div className="flex shrink-0 items-center gap-2">
            {c.ultimo_envio && <span className="text-xs text-suave">{hora(c.ultimo_envio)}</span>}
            {c.no_leidos > 0 && <span className="min-w-5 rounded-full bg-maiz px-1.5 text-center text-xs font-extrabold text-tinta" aria-label={`${c.no_leidos} sin leer`}>{c.no_leidos}</span>}
          </div>
        </div>
        <p className="truncate text-sm text-suave">{c.solicitud}</p>
        <p className={`truncate text-sm ${c.no_leidos > 0 ? "font-bold" : ""}`}>{vista}</p>
      </Link>
    </li>
  );
}

export default function ChatPanel({ rol }: { rol: Rol }) {
  const { conversacionId } = useParams();
  const lista = useConversaciones();
  const propias = (lista.data ?? []).filter((c) => c.mi_rol === rol);
  const actual = propias.find((c) => c.conversation_id === conversacionId);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className={conversacionId ? "hidden lg:block" : ""} aria-label="Conversaciones">
        {lista.isLoading && <p className="text-suave">Cargando…</p>}
        {lista.error && <p role="alert" className="text-error">No se pudieron cargar tus conversaciones.</p>}
        {!lista.isLoading && propias.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-suave">
            {rol === "comprador"
              ? "Cuando elijas una oferta se abrirá aquí una conversación privada con la tienda."
              : "Cuando un comprador elija tu oferta se abrirá aquí una conversación privada con él."}
          </p>
        )}
        <ul className="space-y-2">{propias.map((c) => <ItemConversacion key={c.conversation_id} c={c} rol={rol} activa={c.conversation_id === conversacionId} />)}</ul>
      </aside>
      <section className={!conversacionId ? "hidden lg:block" : ""} aria-label="Mensajes">
        {conversacionId && <p className="mb-2 lg:hidden"><Link to={`/${rol}/chat`} className="font-bold text-mercado underline">← Conversaciones</Link></p>}
        {!conversacionId && <p className="rounded-xl bg-white p-6 text-suave">Elige una conversación para ver los mensajes.</p>}
        {conversacionId && actual && <Hilo key={actual.conversation_id} c={actual} rol={rol} />}
        {conversacionId && !actual && !lista.isLoading && <p className="rounded-xl bg-white p-6 text-suave">No encontramos esa conversación o no tienes acceso a ella.</p>}
      </section>
    </div>
  );
}
