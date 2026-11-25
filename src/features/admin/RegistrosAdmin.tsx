import CierrePedido, { type ControlCierre } from "@/features/pedidos/CierrePedido";
import type { EstadoPedido } from "@/features/pedidos/tipos";
import TachoBaja from "./TachoBaja";
import PromedioListado, { usePromediosListado } from "./PromedioListado";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Boton, { clasesBoton } from "@/components/Boton";
import FiltroEstado from "@/components/FiltroEstado";
import { AccionesTarjeta, PapeleraAuditoria, SeleccionPapelera, useAccionesPapelera, useSeleccionPapelera } from "./PapeleraAdmin";
import { useAuth } from "@/features/auth/AuthContext";
import { FormularioCaso } from "@/features/reclamos/FormularioCaso";
import { accion } from "@/features/reclamos/casos";
import { soles } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type Registro = {
  id: string | number;
  created_at: string;
  [campo: string]: unknown;
};
type Ficha = {
  tabla: string;
  columnas: string;
  buscar?: { etiqueta: string; campo: (texto: string) => string };
  estados?: readonly string[];
  titulo: (f: Registro) => ReactNode;
  detalle: (f: Registro) => ReactNode;
};

const texto = (f: Registro, campo: string) => typeof f[campo] === "string" ? String(f[campo]) : "";
const etiqueta = (valor: unknown) => String(valor ?? "").replace(/_/g, " ");
const fecha = (valor: string) => new Date(valor).toLocaleString("es-PE");

const colorEstado: Record<string, string> = {
  atendida: "text-emerald-800",
  aceptada: "text-emerald-800",
  oferta_aceptada: "text-emerald-800",
  entregado: "text-emerald-800",
  completada: "text-emerald-800",
  abierta: "text-amber-800",
  pendiente: "text-amber-800",
  enviada: "text-amber-800",
  pendiente_confirmacion: "text-amber-800",
  con_ofertas: "text-blue-800",
  compra_coordinada: "text-blue-800",
  en_preparacion: "text-blue-800",
  evidencias_registradas: "text-blue-800",
  enviado_o_listo: "text-blue-800",
  cancelada: "text-error",
  rechazada: "text-error",
};

function Referencia({ seccion, id, nombre, comoBoton = false }: { seccion: string; id: string; nombre: string; comoBoton?: boolean }) {
  return <Link className={comoBoton ? clasesBoton("contorno") : "font-bold text-mercado underline"} to={`/admin/${seccion}?id=${id}`}>{nombre}</Link>;
}

type OfertaDetalle = { price?: number; description: string | null; delivery_terms: string | null; eta: string | null };

function DatosFicha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="space-y-2 rounded-lg border border-borde p-3">
      <summary className="cursor-pointer font-bold text-mercado">{titulo}</summary>
      <dl className="grid gap-3 rounded-lg bg-hoja/40 p-3 text-sm sm:grid-cols-2">{children}</dl>
    </details>
  );
}

function Dato({ rotulo, children, anchoCompleto = false }: { rotulo: string; children: ReactNode; anchoCompleto?: boolean }) {
  return (
    <div className={anchoCompleto ? "sm:col-span-2" : undefined}>
      <dt className="font-bold text-pino">{rotulo}</dt>
      <dd className="whitespace-pre-wrap break-words">{children}</dd>
    </div>
  );
}

const registrosAuditados: Record<string, string> = {
  profiles: "Cuenta de usuario",
  orders: "Pedido",
  limpieza: "Limpieza de datos",
  claims: "Reclamo",
  reclamo: "Reclamo",
  cancellations: "Cancelación",
  cancelacion: "Cancelación",
  sanctions: "Sanción",
  stores: "Tienda",
  products: "Producto",
  tienda: "Tienda",
  usuario: "Cuenta de usuario",
  rating_reports: "Denuncia de calificación",
  conversations: "Conversación",
  subscription_plans: "Plan comercial",
  subscriptions: "Solicitud de plan comercial",
  promotions: "Promoción",
};

const cambiosAuditados: Record<string, string> = {
  vaciar_datos: "Vació secciones de la plataforma",
  cerrar_y_archivar: "Cerró y archivó el registro",
  pedido_reportar: "Reportó una entrega sin código",
  pedido_validar_entrega: "Validó la entrega sin código",
  pedido_rechazar_entrega: "Rechazó el reporte de entrega",
  pedido_confirmar_comprador: "Confirmó el cierre como comprador",
  pedido_confirmar_tienda: "Confirmó el cierre como tienda",
  pedido_intervenir: "Solicitó intervención para el cierre",
  pedido_cerrar_admin: "Cerró la operación como administrador",
  pedido_cerrar_sin_entrega: "Cerró el pedido sin entrega confirmada",
  dar_baja_usuario: "Dio de baja la cuenta",
  dar_baja_tienda: "Dio de baja la tienda",
  activar: "Activó la solicitud",
  rechazar: "Rechazó la solicitud",
  pausar: "Pausó la promoción",
  finalizar: "Finalizó el plan",
  retirar: "Retiró la solicitud",
};

function DetalleOferta({ version }: { version: OfertaDetalle | null }) {
  return <>
    {version?.description && <Dato rotulo="Descripción de la oferta de la tienda" anchoCompleto>{version.description}</Dato>}
    {version?.delivery_terms && <Dato rotulo="Condiciones de entrega ofrecidas">{version.delivery_terms}</Dato>}
    {version?.eta && <Dato rotulo="Tiempo de entrega ofrecido">{version.eta}</Dato>}
  </>;
}

function nombreComprador(fila: Registro) {
  return (fila.comprador as { full_name: string } | null)?.full_name || "Nombre no disponible";
}

const estadoCuenta = [
  ["activo", "Activa"], ["suspendido", "Suspendida"], ["bloqueado", "Bloqueada"],
] as const;

const fichas: Record<string, Ficha> = {
  Usuarios: {
    tabla: "profiles",
    columnas: "id,full_name,email,status,is_seller,is_admin,created_at,admin_baja_at,verificacion:identity_verifications!identity_verifications_user_id_fkey(status,dni)",
    buscar: { etiqueta: "Nombre o correo", campo: (valor) => valor.includes("@") ? "email" : "full_name" },
    estados: estadoCuenta.map(([id]) => id),
    titulo: (f) => texto(f, "full_name") || texto(f, "email") || "Usuario sin nombre",
    detalle: (f) => {
      const verificacion = (f.verificacion as { status: string } | null)?.status;
      const opciones: (readonly [string, string])[] = estadoCuenta.filter(([id]) => id !== f.status);
      if (verificacion === "pendiente" || verificacion === "verificado") {
        opciones.push(["suplantacion", "Bloquear por suplantación"]);
      }
      return <>
        {!f.is_admin && !f.admin_baja_at && <FormularioCaso key={`${f.status}-${verificacion ?? ""}`} titulo="Cambiar estado de la cuenta" opciones={opciones}
          confirmar
          ejecutar={(motivo, estado) => estado === "suplantacion"
            ? accion("admin_bloquear_suplantacion", { p_id: f.id, p_motivo: motivo })
            : accion("admin_estado_usuario", { p_id: f.id, p_estado: estado, p_motivo: motivo })} />}
      </>;
    },
  },
  Solicitudes: {
    tabla: "requests",
    columnas: "id,title,description,status,max_budget,budget_negotiable,buyer_id,created_at,comprador:profiles!requests_buyer_id_fkey(full_name)",
    buscar: { etiqueta: "Título de la solicitud", campo: () => "title" },
    estados: ["abierta", "con_ofertas", "atendida", "vencida", "cancelada", "eliminada"],
    titulo: (f) => texto(f, "title"),
    detalle: (f) => <>
      <DatosFicha titulo="Consultar solicitud">
        <Dato rotulo="Solicitud del comprador">{texto(f, "title")}</Dato>
        <Dato rotulo="Publicada por">{nombreComprador(f)}</Dato>
        <Dato rotulo="Presupuesto máximo del comprador">{soles(Number(f.max_budget))}</Dato>
        <Dato rotulo="Presupuesto negociable">{f.budget_negotiable ? "Sí" : "No"}</Dato>
        {texto(f, "description") && <Dato rotulo="Descripción de la solicitud" anchoCompleto>{texto(f, "description")}</Dato>}
      </DatosFicha>
      <Referencia seccion="usuarios" id={texto(f, "buyer_id")} nombre="Ver comprador" comoBoton />
    </>,
  },
  Ofertas: {
    tabla: "offers",
    columnas: "id,request_id,status,created_at,stores(name),solicitud:requests!offers_request_id_fkey(title),version:offer_history!offers_current_version_fk(price,description,delivery_terms,eta)",
    estados: ["enviada", "aceptada", "rechazada", "reemplazada", "retirada"],
    titulo: (f) => (f.stores as { name: string } | null)?.name ?? "Oferta",
    detalle: (f) => {
      const version = f.version as OfertaDetalle | null;
      return <>
        <DatosFicha titulo="Consultar oferta">
          <Dato rotulo="Solicitud del comprador">{(f.solicitud as { title: string } | null)?.title ?? "Solicitud sin título disponible"}</Dato>
          <Dato rotulo="Tienda que hizo la oferta">{(f.stores as { name: string } | null)?.name ?? "Tienda sin nombre disponible"}</Dato>
          <Dato rotulo="Precio ofrecido por la tienda">{version ? soles(Number(version.price)) : "Sin precio disponible"}</Dato>
          <DetalleOferta version={version} />
        </DatosFicha>
        <Referencia seccion="solicitudes" id={texto(f, "request_id")} nombre="Ver solicitud" comoBoton />
      </>;
    },
  },
  Operaciones: {
    tabla: "orders",
    columnas: "id,request_id,buyer_id,status,agreed_price,delivery_mode,created_at,requests(title),stores(name),comprador:profiles!orders_buyer_id_fkey(full_name),version:offer_history!orders_offer_version_id_fkey(description,delivery_terms,eta),control:order_close_control(*)",
    estados: ["oferta_aceptada", "compra_coordinada", "en_preparacion", "evidencias_registradas", "enviado_o_listo", "pendiente_confirmacion", "entregado", "completada", "cancelada"],
    titulo: (f) => (f.requests as { title: string } | null)?.title ?? "Pedido",
    detalle: (f) => <>
      <CierrePedido id={String(f.id)} uid="" rol="admin" estado={f.status as EstadoPedido} control={(f.control as ControlCierre | null) ?? null} />
      <DatosFicha titulo="Consultar pedido y oferta">
        <Dato rotulo="Solicitud del comprador">{(f.requests as { title: string } | null)?.title ?? "Solicitud sin título disponible"}</Dato>
        <Dato rotulo="Comprador">{nombreComprador(f)}</Dato>
        <Dato rotulo="Tienda del pedido">{(f.stores as { name: string } | null)?.name ?? "Tienda sin nombre disponible"}</Dato>
        <Dato rotulo="Precio acordado del pedido">{soles(Number(f.agreed_price))}</Dato>
        <Dato rotulo="Modalidad de entrega acordada">
          {texto(f, "delivery_mode") === "recojo" ? "Recojo en tienda" : "Entrega a domicilio"}
        </Dato>
        <DetalleOferta version={f.version as OfertaDetalle | null} />
      </DatosFicha>
      <div className="flex flex-wrap gap-3">
        <Referencia seccion="solicitudes" id={texto(f, "request_id")} nombre="Ver solicitud" comoBoton />
        <Referencia seccion="usuarios" id={texto(f, "buyer_id")} nombre="Ver comprador" comoBoton />
      </div>
    </>,
  },
  Reputación: {
    tabla: "rating_reports",
    columnas: "id,reason,status,created_at,ratings(score,comment,status,order_id)",
    estados: ["pendiente", "aceptada", "rechazada"],
    titulo: () => "Denuncia de calificación",
    detalle: (f) => {
      const rating = f.ratings as { score: number; comment: string | null; status: string; order_id: string } | null;
      return <>
        <DatosFicha titulo="Ver detalles de la denuncia">
          <Dato rotulo="Motivo de la denuncia" anchoCompleto>{texto(f, "reason") || "Sin motivo registrado"}</Dato>
          {rating && <>
            <Dato rotulo="Puntuación">{rating.score} de 5</Dato>
            <Dato rotulo="Estado de la calificación"><span className="capitalize">{etiqueta(rating.status)}</span></Dato>
            <Dato rotulo="Comentario de la calificación" anchoCompleto>{rating.comment || "Sin comentario"}</Dato>
            <Dato rotulo="Pedido relacionado" anchoCompleto>
              <Referencia seccion="operaciones" id={rating.order_id} nombre="Ver pedido" comoBoton />
            </Dato>
          </>}
        </DatosFicha>
        {f.status === "pendiente" && <FormularioCaso titulo="Resolver denuncia" opciones={[
          ["aceptar", "Aceptar y ocultar calificación"], ["rechazar", "Rechazar denuncia"],
        ]} confirmar ejecutar={(motivo, decision) => accion("admin_resolver_denuncia_calificacion", {
          p_id: f.id, p_aceptar: decision === "aceptar", p_motivo: motivo,
        })} />}
      </>;
    },
  },
  Auditoría: {
    tabla: "audit_logs",
    columnas: "id,actor_id,action,entity,entity_id,metadata,created_at",
    buscar: { etiqueta: "Nombre de la acción", campo: () => "action" },
    titulo: (f) => <span className="capitalize">{etiqueta(f.action)}</span>,
    detalle: (f) => {
      const actor = texto(f, "actor_id");
      const entidad = texto(f, "entity");
      const meta = f.metadata && typeof f.metadata === "object" ? f.metadata as Registro : null;
      const cambio = meta ? texto(meta, "accion") : "";
      return <DatosFicha titulo="Ver detalles de la acción">
        <Dato rotulo="Quién realizó la acción" anchoCompleto>
          <p>{texto(f, "nombre_actor") || (actor ? "Cuenta sin nombre disponible" : "Sin cuenta asociada")}</p>
          {actor && <Referencia seccion="usuarios" id={actor} nombre="Ver cuenta que realizó la acción" comoBoton />}
        </Dato>
        <Dato rotulo="Registro afectado">{registrosAuditados[entidad] ?? etiqueta(entidad)}</Dato>
        <Dato rotulo="Referencia del registro"><span className="break-all">{texto(f, "entity_id") || "Sin referencia"}</span></Dato>
        <Dato rotulo="Qué cambió" anchoCompleto>
          {meta?.anterior && meta.nuevo ? `Estado anterior: ${etiqueta(meta.anterior)}. Estado nuevo: ${etiqueta(meta.nuevo)}.`
            : typeof meta?.aceptada === "boolean" ? (meta.aceptada ? "Aceptó la denuncia y ocultó la calificación." : "Rechazó la denuncia.")
            : cambiosAuditados[cambio] ?? etiqueta(f.action)}
        </Dato>
        <Dato rotulo="Motivo registrado" anchoCompleto>{meta ? texto(meta, "motivo") || "No se registró un motivo en auditoría." : "No se registró un motivo en auditoría."}</Dato>
        {meta?.identidad_nueva === "rechazado" && <Dato rotulo="Verificación de identidad" anchoCompleto>
          Rechazada. El titular real puede presentar su DNI desde su propia cuenta.
        </Dato>}
      </DatosFicha>;
    },
  },
};

const tamano = 20;
const estadosEliminables: Record<string, readonly string[]> = {
  requests: ["atendida", "vencida", "cancelada", "eliminada"],
  offers: ["aceptada", "rechazada", "reemplazada", "retirada"],
  orders: ["completada", "cancelada"],
  rating_reports: ["aceptada", "rechazada"],
};
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export default function RegistrosAdmin({ seccion }: { seccion: string }) {
  const ficha = fichas[seccion];
  const reputacion = seccion === "Reputación";
  const auditoria = seccion === "Auditoría";
  const operaciones = seccion === "Operaciones";
  const eliminables = estadosEliminables[ficha.tabla];
  const resaltaEstado = Boolean(ficha.estados);
  const { session } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const id = parametros.get("id") ?? "";
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState(reputacion ? "pendiente" : "");
  const [entidad, setEntidad] = useState("");
  const [filtroEntrega, setFiltroEntrega] = useState("");
  const [pagina, setPagina] = useState(0);
  const [papelera, setPapelera] = useState(false);
  const consulta = useQuery({
    queryKey: ["admin", session?.user.id, ficha.tabla, id, busqueda, estado, entidad, filtroEntrega, pagina],
    enabled: !papelera && (!id || uuid.test(id)),
    queryFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const base = supabase.from(ficha.tabla).select(ficha.columnas);
      if (id) base.eq("id", id);
      if (!id && ficha.tabla === "profiles") base.is("admin_baja_at", null);
      if (eliminables && !id) base.is("admin_archived_at", null);
      if (estado && !id) base.eq("status", estado);
      if (operaciones && filtroEntrega && !id) {
        base.not("control", "is", null);
        if (filtroEntrega === "disputa") base.eq("control.reporte", "pendiente");
        else base.not("control.intervencion", "is", null).eq("status", "entregado");
      }
      if (auditoria && entidad && !id) base.in("entity", Object.keys(registrosAuditados).filter((clave) => registrosAuditados[clave] === entidad));
      if (busqueda && ficha.buscar && !id) {
        const termino = auditoria ? busqueda.replace(/\s+/g, "_") : busqueda;
        base.ilike(ficha.buscar.campo(termino), `%${termino.replace(/[\\%_]/g, "\\$&")}%`);
      }
      const inicio = id ? 0 : pagina * tamano;
      const { data, error } = await base.order("created_at", { ascending: false }).order("id")
        .range(inicio, inicio + tamano);
      if (error) throw error;
      const registros = data as unknown as Registro[];
      let filas = registros.slice(0, tamano);
      if (auditoria) {
        const actores = [...new Set(filas.map((fila) => texto(fila, "actor_id")).filter(Boolean))];
        if (actores.length) {
          const perfiles = await supabase.from("profiles").select("id,full_name").in("id", actores);
          if (perfiles.error) throw perfiles.error;
          const nombres = new Map(perfiles.data.map((perfil) => [perfil.id, perfil.full_name]));
          filas = filas.map((fila) => ({ ...fila, nombre_actor: nombres.get(texto(fila, "actor_id")) }));
        }
      }
      return { filas, siguiente: registros.length > tamano };
    },
  });

  const promedios = usePromediosListado("usuarios", seccion === "Usuarios"
    ? (consulta.data?.filas ?? []).map((fila) => String(fila.id)) : []);

  function buscar(e: FormEvent) {
    e.preventDefault();
    setBusqueda(textoBusqueda.trim());
    setPagina(0);
  }
  const acciones = useAccionesPapelera(ficha.tabla, eliminables
    ? consulta.data?.filas.filter((fila) => eliminables.includes(texto(fila, "status"))).map((fila) => String(fila.id)) ?? [] : []);
  const seleccion = useSeleccionPapelera(JSON.stringify([seccion, id, estado, pagina, busqueda, filtroEntrega]),
    !id && acciones ? [...acciones.keys()] : []);

  return (
    <div className="space-y-4">
      {auditoria && <label className="block max-w-xs text-sm font-bold">Vista de Auditoría
        <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3"
          value={papelera ? "papelera" : "actividad"} onChange={(e) => setPapelera(e.target.value === "papelera")}>
          <option value="actividad">Historial de actividad</option>
          <option value="papelera">Papelera</option>
        </select>
      </label>}
      {papelera ? <PapeleraAuditoria /> : <>
      {id ? <div className="flex flex-wrap items-center gap-2">
        <Boton variante="contorno" onClick={() => { setParametros({}); setPagina(0); }}>Volver a todos los registros</Boton>
        {!uuid.test(id) && <p role="alert" className="text-error">La referencia no es válida.</p>}
      </div> : <div className="flex flex-wrap items-end gap-3">
        {ficha.buscar && <form onSubmit={buscar} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-sm font-bold">{ficha.buscar.etiqueta}
            <input className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3" value={textoBusqueda}
              maxLength={120} onChange={(e) => setTextoBusqueda(e.target.value)} />
          </label>
          <Boton type="submit" variante="contorno">Buscar</Boton>
        </form>}
        {ficha.estados && <FiltroEstado estados={ficha.estados} valor={estado}
          cambiar={(valor) => { setEstado(valor); setPagina(0); }} />}
        {operaciones && <label className="text-sm font-bold">Entrega y cierre
          <select className="mt-1 block min-h-11 rounded-lg border border-borde bg-white px-3" value={filtroEntrega}
            onChange={(e) => { setFiltroEntrega(e.target.value); setEstado(""); setPagina(0); }}>
            <option value="">Todos</option>
            <option value="disputa">Entrega en disputa</option>
            <option value="intervencion">Intervención solicitada</option>
          </select>
        </label>}
        {auditoria && <label className="text-sm font-bold">Registro afectado
          <select className="mt-1 block min-h-11 rounded-lg border border-borde bg-white px-3" value={entidad}
            onChange={(e) => { setEntidad(e.target.value); setPagina(0); }}>
            <option value="">Todos los registros</option>
            {[...new Set(Object.values(registrosAuditados))].sort((a, b) => a.localeCompare(b, "es"))
              .map((valor) => <option key={valor}>{valor}</option>)}
          </select>
        </label>}
      </div>}
      {eliminables && consulta.data?.filas.length && !id && acciones?.size === 0 ? (
        <p className="text-sm text-suave">No hay registros listos para archivar o enviar a la papelera en este filtro.</p>
      ) : null}
      <SeleccionPapelera tabla={ficha.tabla} seleccion={seleccion} acciones={acciones} />
      {consulta.isLoading && <p className="text-suave">Cargando registros…</p>}
      {consulta.isError && <p role="alert" className="text-error">No se pudieron cargar los registros.</p>}
      {consulta.isSuccess && consulta.data.filas.length === 0 && <p className="rounded-xl bg-white p-4 text-suave">No hay registros para esta consulta.</p>}
      {seccion === "Usuarios" ? (
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-white">
          {consulta.data?.filas.map((f) => (
            <li key={f.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 break-words font-display text-lg font-bold text-pino">{ficha.titulo(f)}</h2>
                {!f.is_admin && !f.admin_baja_at && <TachoBaja id={String(f.id)} tipo="usuario"
                  nombre={texto(f, "full_name") || texto(f, "email") || "este usuario"} />}
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <Dato rotulo="DNI">{(f.verificacion as { dni?: string } | null)?.dni || "Sin registro"}</Dato>
                <Dato rotulo="Correo">{texto(f, "email") || "Sin correo"}</Dato>
                <Dato rotulo="Estado y rol">
                  <span className={`font-semibold ${f.status === "activo" ? "text-emerald-800" : f.status === "suspendido" ? "text-amber-800" : "text-error"}`}>
                    {f.admin_baja_at ? "Dada de baja" : estadoCuenta.find(([clave]) => clave === f.status)?.[1] ?? etiqueta(f.status)}
                  </span>
                  <span className="text-suave"> · {f.is_admin ? "Administración" : f.is_seller ? "Vendedor" : "Comprador"}</span>
                </Dato>
                <Dato rotulo="Reputación como comprador"><PromedioListado id={String(f.id)} consulta={promedios} /></Dato>
              </dl>
              {ficha.detalle(f)}
            </li>
          ))}
        </ul>
      ) : (
      <ul className={reputacion || auditoria ? "grid items-start gap-3 lg:grid-cols-2" : "space-y-3"}>
        {consulta.data?.filas.map((f) => <li key={f.id} className="space-y-2 rounded-xl border border-borde bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 break-words font-display text-lg font-bold text-pino">{ficha.titulo(f)}</h2>
            {(acciones?.has(String(f.id)) || seleccion.visibles.includes(String(f.id))) &&
              <AccionesTarjeta tabla={ficha.tabla} id={String(f.id)} seleccion={seleccion}
                accion={acciones?.get(String(f.id))} />}
            {operaciones && f.status !== "completada" && f.status !== "cancelada" &&
              <TachoBaja id={String(f.id)} nombre={String(ficha.titulo(f))} tipo={f.status === "entregado" ? "pedido_entregado" : "pedido"} />}
            {ficha.tabla === "requests" && ["abierta", "con_ofertas"].includes(String(f.status)) &&
              <TachoBaja id={String(f.id)} nombre={String(ficha.titulo(f))} tipo="solicitud" />}
            {ficha.tabla === "offers" && f.status === "enviada" &&
              <TachoBaja id={String(f.id)} nombre={String(ficha.titulo(f))} tipo="oferta" />}
          </div>
          <p className="text-sm text-suave">
            {f.status ? <>
              <span className={resaltaEstado ? `font-bold capitalize ${colorEstado[String(f.status)] ?? "text-slate-600"}` : "capitalize"}>
                {etiqueta(f.status)}
              </span>
              {" · "}
            </> : null}
            {fecha(f.created_at)}
          </p>
          {ficha.detalle(f)}
          <p className="break-all text-xs text-suave">ID {f.id}</p>
        </li>)}
      </ul>
      )}
      {!id && (pagina > 0 || consulta.data?.siguiente) && <nav aria-label="Páginas de resultados" className="flex flex-wrap items-center gap-2">
        <Boton variante="contorno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
        <span className="text-sm">Página {pagina + 1}</span>
        <Boton variante="contorno" disabled={!consulta.data?.siguiente} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
      </nav>}
      </>}
    </div>
  );
}
