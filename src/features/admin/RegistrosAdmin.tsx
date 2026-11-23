import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
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

function Referencia({ seccion, id, nombre }: { seccion: string; id: string; nombre: string }) {
  return <Link className="font-bold text-mercado underline" to={`/admin/${seccion}?id=${id}`}>{nombre}</Link>;
}

const estadoCuenta = [
  ["activo", "Activa"], ["suspendido", "Suspendida"], ["bloqueado", "Bloqueada"],
] as const;

const fichas: Record<string, Ficha> = {
  Usuarios: {
    tabla: "profiles",
    columnas: "id,full_name,email,status,is_seller,is_admin,created_at",
    buscar: { etiqueta: "Nombre o correo", campo: (valor) => valor.includes("@") ? "email" : "full_name" },
    estados: estadoCuenta.map(([id]) => id),
    titulo: (f) => texto(f, "full_name") || texto(f, "email") || "Usuario sin nombre",
    detalle: (f) => <>
      <p className="break-words text-sm">{texto(f, "email")} · {f.is_admin ? "Administración" : f.is_seller ? "Vendedor" : "Comprador"}</p>
      {!f.is_admin && <FormularioCaso key={String(f.status)} titulo="Cambiar estado de la cuenta" opciones={estadoCuenta.filter(([id]) => id !== f.status)} confirmar
        ejecutar={(motivo, estado) => accion("admin_estado_usuario", { p_id: f.id, p_estado: estado, p_motivo: motivo })} />}
    </>,
  },
  Solicitudes: {
    tabla: "requests",
    columnas: "id,title,description,status,max_budget,buyer_id,created_at",
    buscar: { etiqueta: "Título de la solicitud", campo: () => "title" },
    estados: ["abierta", "con_ofertas", "atendida", "vencida", "cancelada", "eliminada"],
    titulo: (f) => texto(f, "title"),
    detalle: (f) => <>
      <p>Presupuesto máximo · {soles(Number(f.max_budget))}</p>
      {f.description && <p className="whitespace-pre-wrap break-words">{texto(f, "description")}</p>}
      <Referencia seccion="usuarios" id={texto(f, "buyer_id")} nombre="Ver comprador" />
    </>,
  },
  Ofertas: {
    tabla: "offers",
    columnas: "id,request_id,store_id,status,created_at,stores(name),version:offer_history!offers_current_version_fk(price,description,delivery_terms)",
    estados: ["enviada", "aceptada", "rechazada", "reemplazada", "retirada"],
    titulo: (f) => (f.stores as { name: string } | null)?.name ?? "Oferta",
    detalle: (f) => {
      const version = f.version as { price: number; description: string | null; delivery_terms: string | null } | null;
      return <>
        {version && <p>{soles(Number(version.price))}</p>}
        {version?.description && <p className="whitespace-pre-wrap break-words">{version.description}</p>}
        {version?.delivery_terms && <p className="whitespace-pre-wrap break-words">{version.delivery_terms}</p>}
        <Referencia seccion="solicitudes" id={texto(f, "request_id")} nombre="Ver solicitud" />
      </>;
    },
  },
  Operaciones: {
    tabla: "orders",
    columnas: "id,request_id,buyer_id,status,agreed_price,delivery_mode,created_at,requests(title),stores(name)",
    estados: ["oferta_aceptada", "compra_coordinada", "en_preparacion", "evidencias_registradas", "enviado_o_listo", "pendiente_confirmacion", "entregado", "completada", "cancelada"],
    titulo: (f) => (f.requests as { title: string } | null)?.title ?? "Pedido",
    detalle: (f) => <>
      <p>{(f.stores as { name: string } | null)?.name ?? "Tienda"} · {soles(Number(f.agreed_price))} · {texto(f, "delivery_mode") === "recojo" ? "Recojo" : "Domicilio"}</p>
      <div className="flex flex-wrap gap-3">
        <Referencia seccion="solicitudes" id={texto(f, "request_id")} nombre="Ver solicitud" />
        <Referencia seccion="usuarios" id={texto(f, "buyer_id")} nombre="Ver comprador" />
      </div>
    </>,
  },
  Reportes: {
    tabla: "rating_reports",
    columnas: "id,reason,status,created_at,ratings(score,comment,status,order_id)",
    estados: ["pendiente", "aceptada", "rechazada"],
    titulo: () => "Denuncia de calificación",
    detalle: (f) => {
      const rating = f.ratings as { score: number; comment: string | null; status: string; order_id: string } | null;
      return <>
        <p className="whitespace-pre-wrap break-words"><strong>Motivo</strong> · {texto(f, "reason")}</p>
        {rating && <>
          <p className="whitespace-pre-wrap break-words"><strong>Calificación</strong> · {rating.score} de 5 · {rating.status}{rating.comment ? ` · ${rating.comment}` : ""}</p>
          <Referencia seccion="operaciones" id={rating.order_id} nombre="Ver pedido" />
        </>}
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
    detalle: (f) => <>
      <p className="break-all">{texto(f, "entity")} · {texto(f, "entity_id") || "Sin referencia"}</p>
      {f.actor_id && <Referencia seccion="usuarios" id={texto(f, "actor_id")} nombre="Ver cuenta que realizó la acción" />}
      {typeof f.metadata === "object" && f.metadata !== null && "motivo" in f.metadata && (
        <p className="whitespace-pre-wrap break-words">Motivo · {String(f.metadata.motivo)}</p>
      )}
    </>,
  },
};

const tamano = 20;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export default function RegistrosAdmin({ seccion }: { seccion: string }) {
  const ficha = fichas[seccion];
  const { session } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const id = parametros.get("id") ?? "";
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState(seccion === "Reportes" ? "pendiente" : "");
  const [pagina, setPagina] = useState(0);
  const consulta = useQuery({
    queryKey: ["admin", session?.user.id, ficha.tabla, id, busqueda, estado, pagina],
    enabled: !id || uuid.test(id),
    queryFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const base = supabase.from(ficha.tabla).select(ficha.columnas);
      if (id) base.eq("id", id);
      if (estado && !id) base.eq("status", estado);
      if (busqueda && ficha.buscar && !id) base.ilike(ficha.buscar.campo(busqueda), `%${busqueda.replace(/[\\%_]/g, "\\$&")}%`);
      const inicio = id ? 0 : pagina * tamano;
      const { data, error } = await base.order("created_at", { ascending: false }).order("id")
        .range(inicio, inicio + tamano);
      if (error) throw error;
      const filas = data as unknown as Registro[];
      return { filas: filas.slice(0, tamano), siguiente: filas.length > tamano };
    },
  });

  function buscar(e: FormEvent) {
    e.preventDefault();
    setBusqueda(textoBusqueda.trim());
    setPagina(0);
  }

  return (
    <div className="space-y-4">
      {id ? <div className="flex flex-wrap items-center gap-2">
        <Boton variante="contorno" onClick={() => { setParametros({}); setPagina(0); }}>Volver a todos los registros</Boton>
        {!uuid.test(id) && <p role="alert" className="text-error">La referencia no es válida.</p>}
      </div> : <div className="flex flex-wrap items-end gap-3">
        {ficha.buscar && <form onSubmit={buscar} className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-bold">{ficha.buscar.etiqueta}
            <input className="mt-1 block min-h-11 rounded-lg border border-borde bg-white px-3" value={textoBusqueda}
              maxLength={120} onChange={(e) => setTextoBusqueda(e.target.value)} />
          </label>
          <Boton type="submit" variante="contorno">Buscar</Boton>
        </form>}
        {ficha.estados && <label className="text-sm font-bold">Estado
          <select className="mt-1 block min-h-11 rounded-lg border border-borde bg-white px-3" value={estado}
            onChange={(e) => { setEstado(e.target.value); setPagina(0); }}>
            <option value="">Todos los estados</option>
            {ficha.estados.map((valor) => <option key={valor} value={valor}>{etiqueta(valor)}</option>)}
          </select>
        </label>}
      </div>}
      {consulta.isLoading && <p className="text-suave">Cargando registros…</p>}
      {consulta.isError && <p role="alert" className="text-error">No se pudieron cargar los registros.</p>}
      {consulta.isSuccess && consulta.data.filas.length === 0 && <p className="rounded-xl bg-white p-4 text-suave">No hay registros para esta consulta.</p>}
      <ul className="space-y-3">
        {consulta.data?.filas.map((f) => <li key={f.id} className="space-y-2 rounded-xl border border-borde bg-white p-4">
          <h2 className="break-words font-display text-lg font-bold text-pino">{ficha.titulo(f)}</h2>
          <p className="text-sm text-suave capitalize">{f.status ? `${etiqueta(f.status)} · ` : ""}{fecha(f.created_at)}</p>
          {ficha.detalle(f)}
          <p className="break-all text-xs text-suave">ID {f.id}</p>
        </li>)}
      </ul>
      {!id && (pagina > 0 || consulta.data?.siguiente) && <nav aria-label="Páginas de resultados" className="flex flex-wrap items-center gap-2">
        <Boton variante="contorno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
        <span className="text-sm">Página {pagina + 1}</span>
        <Boton variante="contorno" disabled={!consulta.data?.siguiente} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
      </nav>}
    </div>
  );
}
