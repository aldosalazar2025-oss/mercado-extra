import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CasosPedido from "@/features/reclamos/CasosPedido";
import CalificarPedido from "@/features/reputacion/CalificarPedido";
import Boton from "@/components/Boton";
import { useAuth } from "@/features/auth/AuthContext";
import { comprimirImagen } from "@/lib/imagen";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useEventos, useEvidencias, usePedidos } from "./hooks";
import {
  EVIDENCIAS, EVIDENCIA_RECOJO, PASOS, etiquetaEstado, mensajeResultado, textoEvento, traducirErrorPedido,
  type EstadoPedido, type Pedido, type ResultadoEntrega, type TipoEvidencia,
} from "./tipos";

type Rol = "comprador" | "vendedor";

function Progreso({ p }: { p: Pedido }) {
  const actual = PASOS.indexOf(p.estado);
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Avance del pedido">
      {PASOS.map((paso, i) => {
        const hecho = i < actual || p.estado === "completada";
        const ahora = i === actual && p.estado !== "completada";
        return (
          <li key={paso} aria-current={ahora ? "step" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-bold ${hecho ? "bg-hoja text-pino" : ahora ? "bg-maiz text-tinta" : "border border-borde bg-white text-suave"}`}>
            {hecho ? "✓ " : ""}{etiquetaEstado(paso, p.modo)}
          </li>
        );
      })}
    </ol>
  );
}

function Evidencias({ p, editable, uid }: { p: Pedido; editable: boolean; uid: string }) {
  const cliente = useQueryClient();
  const { data, isLoading } = useEvidencias(p.order_id);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<TipoEvidencia | null>(null);
  const recojo = p.modo === "recojo";
  const slots = recojo ? [...EVIDENCIAS, EVIDENCIA_RECOJO] : EVIDENCIAS;
  const refrescar = () => void cliente.invalidateQueries({ queryKey: ["pedidos"] });

  async function subir(tipo: TipoEvidencia, archivos: FileList | null) {
    if (!supabase || !archivos?.length) return;
    setError(null);
    setSubiendo(tipo);
    try {
      for (const f of Array.from(archivos)) {
        const blob = await comprimirImagen(f, 1400);
        const ruta = `${p.order_id}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        const up = await supabase.storage.from("delivery-evidence").upload(ruta, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error("No se pudo subir la foto.");
        const fila = await supabase.from("delivery_evidence").insert({ order_id: p.order_id, type: tipo, file_path: ruta, uploaded_by: uid });
        if (fila.error) {
          await supabase.storage.from("delivery-evidence").remove([ruta]);
          throw new Error(traducirErrorPedido(fila.error.message));
        }
      }
      refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(null);
    }
  }

  async function quitar(id: string, ruta: string) {
    if (!supabase || !confirm("¿Quitar esta foto?")) return;
    const r = await supabase.from("delivery_evidence").delete().eq("id", id).select("id");
    if (r.error || !r.data?.length) return setError("No se pudo quitar la foto.");
    await supabase.storage.from("delivery-evidence").remove([ruta]);
    refrescar();
  }

  const hayFotos = (data?.filas.length ?? 0) > 0;
  if (!editable && !hayFotos) return null;

  return (
    <section className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold text-pino">{editable ? "Fotos del pedido" : "Fotos que subió la tienda"}</h3>
      {editable && !recojo && <p className="text-sm text-suave">Para enviar el pedido debes subir las 4 fotos. Hasta 3 por cada tipo. Se guardan como evidencia de cómo preparaste el pedido.</p>}
      {editable && recojo && <p className="text-sm text-suave">En pedidos para recojo las fotos son opcionales, pero ayudan a ambas partes.</p>}
      {!editable && <p className="text-sm text-suave">Muestran cómo se preparó el pedido. No prueban por sí solas que llegó en esas condiciones.</p>}
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      {isLoading && <p className="text-suave">Cargando…</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {slots.filter((s) => editable || (data?.filas.some((f) => f.type === s.tipo))).map((s) => {
          const fotos = data?.filas.filter((f) => f.type === s.tipo) ?? [];
          const puedeSubir = editable && (s.tipo !== "recojo" ? (p.estado === "compra_coordinada" || p.estado === "en_preparacion") : true);
          return (
            <div key={s.tipo} className="space-y-2 rounded-lg border border-borde p-3">
              <p className="font-bold">{s.titulo} <span className="text-sm font-normal text-suave">{!recojo && editable ? `(${fotos.length}/3)` : ""}</span></p>
              {editable && <p className="text-sm text-suave">{s.ayuda}</p>}
              {fotos.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {fotos.map((f) => (
                    <li key={f.id} className="space-y-1 text-center">
                      {data?.urls.get(f.file_path) ? (
                        <a href={data.urls.get(f.file_path)} target="_blank" rel="noreferrer"><img src={data.urls.get(f.file_path)} alt={s.titulo} className="h-24 w-24 rounded-lg border border-borde object-cover" loading="lazy" /></a>
                      ) : <div className="h-24 w-24 rounded-lg bg-hoja" />}
                      {puedeSubir && (p.estado === "compra_coordinada" || p.estado === "en_preparacion") && <button type="button" className="text-sm font-bold text-error underline" onClick={() => void quitar(f.id, f.file_path)}>Quitar</button>}
                    </li>
                  ))}
                </ul>
              )}
              {puedeSubir && fotos.length < 3 && (
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border-2 border-mercado px-3 font-bold text-mercado hover:bg-hoja">
                  {subiendo === s.tipo ? "Subiendo…" : "Agregar foto"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" disabled={subiendo !== null}
                    onChange={(e) => { void subir(s.tipo, e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CodigoComprador({ p }: { p: Pedido }) {
  const cliente = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const activo = p.estado === "enviado_o_listo" || p.estado === "pendiente_confirmacion";
  const consulta = useQuery({
    queryKey: ["pedidos", "codigo", p.order_id, p.estado],
    enabled: Boolean(supabase) && (activo || p.estado === "entregado" || p.estado === "completada"),
    queryFn: async () => {
      if (!supabase) return null;
      const { data, error } = await supabase.rpc("obtener_codigo_entrega", { p_order: p.order_id });
      if (error) throw error;
      return ((data ?? []) as { codigo: string | null; vence: string; intentos: number; bloqueado_hasta: string | null; generaciones: number; usado: boolean }[])[0] ?? null;
    },
  });
  const regenerar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { error } = await supabase.rpc("regenerar_codigo_entrega", { p_order: p.order_id });
      if (error) throw new Error(traducirErrorPedido(error.message));
    },
    onSuccess: () => { setMensaje("Generamos un código nuevo. El anterior ya no sirve."); void cliente.invalidateQueries({ queryKey: ["pedidos"] }); },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });
  const c = consulta.data;
  if (!c) return consulta.isLoading ? <p className="text-suave">Cargando…</p> : null;

  if (c.usado) return <section className="rounded-xl bg-hoja p-4"><p className="font-bold text-pino">Código usado: la entrega fue confirmada.</p></section>;
  if (!c.codigo) return null;
  const bloqueado = c.bloqueado_hasta && new Date(c.bloqueado_hasta) > new Date();
  return (
    <section className="space-y-3 rounded-xl border-2 border-maiz bg-maiz-suave p-4" aria-live="polite">
      <h3 className="font-display text-lg font-bold">Tu código de entrega</h3>
      <p className="font-display text-5xl font-extrabold tracking-[0.3em] text-pino" aria-label={`Código ${c.codigo.split("").join(" ")}`}>{c.codigo}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li><strong>Díctaselo al vendedor solo cuando tengas el producto en tus manos.</strong> No lo compartas por chat ni antes de recibirlo.</li>
        <li>Vence el {new Date(c.vence).toLocaleDateString("es-PE", { day: "numeric", month: "long" })}.</li>
        {bloqueado && <li className="font-semibold">Hubo varios intentos fallidos: el código está bloqueado un rato. Puedes generar uno nuevo.</li>}
      </ul>
      {mensaje && <p role="status" className="text-sm font-semibold">{mensaje}</p>}
      {c.generaciones < 3 && (
        <Boton variante="contorno" disabled={regenerar.isPending} onClick={() => { if (confirm("Se generará un código nuevo y el actual dejará de servir. ¿Continuar?")) regenerar.mutate(); }}>Generar un código nuevo</Boton>
      )}
    </section>
  );
}

function ConfirmarEntrega({ p }: { p: Pedido }) {
  const cliente = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [res, setRes] = useState<{ texto: string; ok: boolean } | null>(null);
  const confirmar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { data, error } = await supabase.rpc("confirmar_entrega", { p_order: p.order_id, p_codigo: codigo });
      if (error) throw new Error(traducirErrorPedido(error.message));
      return data as ResultadoEntrega;
    },
    onSuccess: (r) => {
      setRes(mensajeResultado(r));
      if (r.resultado === "correcto") setCodigo("");
      void cliente.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (e) => setRes({ texto: e instanceof Error ? e.message : "Error", ok: false }),
  });
  return (
    <section className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold text-pino">Confirmar la entrega</h3>
      <p className="text-sm text-suave">Cuando el comprador reciba el producto, pídele su código de 6 dígitos y escríbelo aquí. No lo recibes por chat ni lo puedes ver antes.</p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setRes(null); confirmar.mutate(); }}>
        <div>
          <label htmlFor="codigo-entrega" className="block font-bold">Código del comprador</label>
          <input id="codigo-entrega" inputMode="numeric" autoComplete="off" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            className="min-h-11 w-48 rounded-lg border border-borde px-3 text-center font-display text-2xl tracking-[0.3em]" placeholder="······" />
        </div>
        <Boton type="submit" variante="primario" disabled={confirmar.isPending || codigo.length !== 6}>Confirmar entrega</Boton>
      </form>
      {res && <p role={res.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm font-semibold ${res.ok ? "bg-hoja text-pino" : "border border-error/40 text-error"}`}>{res.texto}</p>}
    </section>
  );
}

function siguientePaso(p: Pedido): { estado: EstadoPedido; texto: string; ayuda: string } | null {
  switch (p.estado) {
    case "oferta_aceptada": return { estado: "compra_coordinada", texto: "Confirmar compra coordinada", ayuda: "Úsalo cuando ya acordaron con el comprador el precio, la entrega y el horario (puedes hablarlo en el chat)." };
    case "compra_coordinada": return { estado: "en_preparacion", texto: "Empezar a preparar el pedido", ayuda: "Marca que ya estás alistando el producto." };
    case "en_preparacion": return { estado: "evidencias_registradas", texto: "Registrar evidencias", ayuda: p.modo === "domicilio" ? "Sube las 4 fotos obligatorias y registra las evidencias. Después ya no se pueden cambiar." : "Sube al menos una foto y registra las evidencias, o salta este paso con «Listo para recojo (sin fotos)»." };
    case "evidencias_registradas": return { estado: "enviado_o_listo", texto: p.modo === "recojo" ? "Marcar listo para recojo" : "Marcar como enviado", ayuda: "Al hacerlo, el comprador recibe su código de entrega." };
    case "enviado_o_listo": return { estado: "pendiente_confirmacion", texto: "Estoy entregando al comprador", ayuda: "Opcional: avisa que estás entregando. Al recibir, el comprador te dicta su código." };
    default: return null;
  }
}

function AccionesTienda({ p }: { p: Pedido }) {
  const cliente = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const avanzar = useMutation({
    mutationFn: async (estado: EstadoPedido) => {
      if (!supabase) throw new Error("Sin conexión");
      const { error: e } = await supabase.rpc("avanzar_pedido", { p_order: p.order_id, p_estado: estado });
      if (e) throw new Error(traducirErrorPedido(e.message));
    },
    onSuccess: () => { setError(null); void cliente.invalidateQueries({ queryKey: ["pedidos"] }); },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });
  const sig = siguientePaso(p);
  if (!sig) return null;
  const faltanFotos = p.estado === "en_preparacion" && p.modo === "domicilio" && p.fotos_obligatorias < 4;
  return (
    <section className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold text-pino">Siguiente paso</h3>
      <p className="text-sm text-suave">{sig.ayuda}</p>
      {faltanFotos && <p className="text-sm font-semibold">Fotos obligatorias: {p.fotos_obligatorias} de 4.</p>}
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" disabled={avanzar.isPending || faltanFotos} onClick={() => avanzar.mutate(sig.estado)}>{sig.texto}</Boton>
        {p.estado === "en_preparacion" && p.modo === "recojo" && (
          <Boton variante="contorno" disabled={avanzar.isPending} onClick={() => avanzar.mutate("enviado_o_listo")}>Listo para recojo (sin fotos)</Boton>
        )}
      </div>
    </section>
  );
}

function AccionesComprador({ p }: { p: Pedido }) {
  const cliente = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const completar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const { error: e } = await supabase.rpc("completar_pedido", { p_order: p.order_id });
      if (e) throw new Error(traducirErrorPedido(e.message));
    },
    onSuccess: () => { setError(null); void cliente.invalidateQueries({ queryKey: ["pedidos"] }); },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });
  if (p.estado !== "entregado") return null;
  return (
    <section className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <h3 className="font-display text-lg font-bold text-pino">¿Todo bien con tu compra?</h3>
      <p className="text-sm text-suave">Si recibiste lo acordado, cierra la operación. Puedes calificar antes o después de completar la operación.</p>
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <Boton variante="secundario" disabled={completar.isPending} onClick={() => { if (confirm("¿Confirmas que todo está bien y quieres completar la operación?")) completar.mutate(); }}>Completar la operación</Boton>
    </section>
  );
}

export default function PedidoDetalle({ rol }: { rol: Rol }) {
  const { orderId = "" } = useParams();
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const lista = usePedidos();
  const eventos = useEventos(orderId);
  const p = lista.data?.find((x) => x.order_id === orderId && x.mi_rol === rol);
  const volver = <p><Link to={rol === "comprador" ? "/comprador/mis-compras" : "/vendedor/pedidos"} className="font-bold text-mercado underline">← {rol === "comprador" ? "Mis compras" : "Pedidos"}</Link></p>;

  if (lista.isLoading) return <p className="text-suave">Cargando…</p>;
  if (!p) return <div className="space-y-3">{volver}<p className="rounded-xl bg-white p-6 text-suave">No encontramos ese pedido o no tienes acceso a él.</p></div>;

  const antesDeEnviar = p.estado === "compra_coordinada" || p.estado === "en_preparacion";
  const otro = rol === "comprador" ? p.tienda : p.comprador || "Comprador";
  const enEntrega = p.estado === "enviado_o_listo" || p.estado === "pendiente_confirmacion";

  return (
    <div className="space-y-4">
      {volver}
      <header className="space-y-2 rounded-xl border border-borde bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-extrabold">{p.solicitud}</h2>
            <p className="text-sm text-suave">{rol === "comprador" ? "Tienda" : "Comprador"}: {otro} · {p.modo === "domicilio" ? "Entrega a domicilio" : "Recojo en tienda"}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-pino">{soles(p.precio)}</p>
            <p className="text-sm font-bold">{etiquetaEstado(p.estado, p.modo)}</p>
          </div>
        </div>
        <Progreso p={p} />
        <p className="text-sm">
          {p.conversation_id && <Link to={`/${rol}/chat/${p.conversation_id}`} className="font-bold text-mercado underline">Abrir el chat</Link>}
          {p.conversation_id && " · "}
          <span className="text-suave">Los pagos se acuerdan directamente entre comprador y vendedor.</span>
        </p>
      </header>

      {rol === "vendedor" && <AccionesTienda p={p} />}
      {rol === "vendedor" && enEntrega && <ConfirmarEntrega p={p} />}
      {rol === "comprador" && <CodigoComprador p={p} />}
      {rol === "comprador" && <AccionesComprador p={p} />}
      {(p.estado === "entregado" || p.estado === "completada") && <CalificarPedido key={p.order_id + p.mi_rol + uid} p={p} uid={uid} />}
      <CasosPedido key={p.order_id + p.mi_rol + uid} pedido={p} uid={uid} />
      <Evidencias p={p} editable={rol === "vendedor" && (antesDeEnviar || (p.modo === "recojo" && enEntrega))} uid={uid} />

      <section className="space-y-2 rounded-xl border border-borde bg-white p-4">
        <h3 className="font-display text-lg font-bold text-pino">Historial del pedido</h3>
        {eventos.isLoading && <p className="text-suave">Cargando…</p>}
        <ol className="space-y-1 text-sm">
          {eventos.data?.map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString("es-PE")} · {textoEvento(e, p.modo)}</li>)}
        </ol>
      </section>
    </div>
  );
}
