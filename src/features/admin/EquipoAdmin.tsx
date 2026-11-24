import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo from "@/components/Campo";
import { accion, useCasosMutation, useUid } from "@/features/reclamos/casos";
import { supabase } from "@/lib/supabase";

const modulos = {
  resumen: "Resumen general",
  usuarios: "Usuarios",
  identidad: "Verificación de identidad",
  tiendas: "Tiendas",
  categorias: "Categorías",
  productos: "Productos",
  solicitudes: "Solicitudes",
  ofertas: "Ofertas",
  operaciones: "Operaciones",
  reclamos: "Reclamos",
  cancelaciones: "Cancelaciones",
  sanciones: "Sanciones",
  promociones: "Promociones",
  planes: "Planes comerciales",
  reputacion: "Reputación",
  auditoria: "Auditoría",
};
type Permiso = keyof typeof modulos;
type Invitacion = { id: string; correo: string; permisos: Permiso[]; estado: "pendiente" | "activa" | "revocada" };
type Registro = { id: string; titulo: string; estado: string; fecha: string | null };

export function useMiAccesoAdmin() {
  const uid = useUid();
  return useQuery({
    queryKey: ["admin", uid, "mi-acceso"],
    enabled: Boolean(uid && supabase),
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("mi_acceso_administrativo");
      if (error) throw new Error(error.message);
      return data as Invitacion | null;
    },
  });
}

export function EquipoAdmin() {
  const uid = useUid();
  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState("");
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [mensaje, setMensaje] = useState("");
  const equipo = useQuery({
    queryKey: ["admin", uid, "equipo"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("admin_equipo");
      if (error) throw new Error(error.message);
      return data as { titulares: number; invitaciones: Invitacion[] };
    },
  });
  const guardar = useCasosMutation(async () => {
    await accion("admin_invitar", { p_correo: correo.trim(), p_permisos: permisos });
    setCorreo("");
    setPermisos([]);
    setMensaje("Permisos guardados. La invitación pendiente se verá al iniciar sesión con ese correo.");
  });
  const revocar = useCasosMutation(async (id: string) => {
    await accion("admin_revocar_invitacion", { p_id: id });
    setMensaje("Acceso revocado.");
  });
  const invitaciones = equipo.data?.invitaciones ?? [];
  const total = equipo.data ? equipo.data.titulares + invitaciones.filter((i) => i.estado === "activa").length : null;
  function invitar(e: FormEvent) {
    e.preventDefault();
    if (permisos.length) guardar.mutate();
  }
  return <>
    <li className="flex min-h-28 items-end justify-between gap-2 rounded-xl border border-borde bg-white p-4">
      <div>
        <p className="text-3xl font-extrabold text-pino">{total ?? "—"}</p>
        <p className="mt-1 text-sm font-bold">Administradores</p>
      </div>
      <button type="button" aria-label="Invitar administrador" aria-expanded={abierto} aria-controls="equipo-administrativo"
        className="flex size-11 items-center justify-center rounded-lg bg-mercado text-2xl font-bold text-white hover:bg-pino"
        onClick={() => { setAbierto(!abierto); setMensaje(""); }}>
        <span aria-hidden="true">{abierto ? "−" : "+"}</span>
      </button>
    </li>
    {abierto && <li id="equipo-administrativo" className="space-y-4 rounded-xl border border-borde bg-white p-4 sm:col-span-2 lg:col-span-3">
      <h2 className="font-display text-lg font-bold text-pino">Invitar administrador</h2>
      <p className="text-sm text-suave">El invitado puede consultar solo las secciones seleccionadas. Verá la invitación al iniciar sesión con ese correo de Google.</p>
      <form className="space-y-3" onSubmit={invitar}>
        <Campo etiqueta="Correo de Google" type="email" required maxLength={254} value={correo}
          onChange={(e) => setCorreo(e.target.value)} />
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold">Permisos de consulta</legend>
          {(Object.keys(modulos) as Permiso[]).map((p) => <label key={p} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={permisos.includes(p)} onChange={(e) =>
              setPermisos((previos) => e.target.checked ? [...previos, p] : previos.filter((valor) => valor !== p))} />
            {modulos[p]}
          </label>)}
        </fieldset>
        <Boton type="submit" disabled={guardar.isPending || equipo.isError || permisos.length === 0}>Guardar invitación</Boton>
      </form>
      {mensaje && <p role="status" className="text-sm text-pino">{mensaje}</p>}
      {(equipo.isError || guardar.isError || revocar.isError) && <p role="alert" className="text-sm text-error">
        {guardar.error?.message || revocar.error?.message || "No se pudo consultar el equipo administrativo."}
      </p>}
      {invitaciones.length > 0 && <ul className="space-y-2">
        {invitaciones.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde p-3">
          <div>
            <p className="break-all font-semibold">{i.correo}</p>
            <p className="text-sm text-suave"><span className="capitalize">{i.estado}</span> · {i.permisos.map((p) => modulos[p]).join(", ")}</p>
          </div>
          {i.estado !== "revocada" && <div className="flex flex-wrap gap-2">
            <Boton variante="contorno" onClick={() => { setCorreo(i.correo); setPermisos(i.permisos); }}>Editar permisos</Boton>
            <Boton variante="contorno" disabled={revocar.isPending} onClick={() => {
              if (confirm(`¿Revocar el acceso de ${i.correo}?`)) revocar.mutate(i.id);
            }}>Revocar acceso</Boton>
          </div>}
        </li>)}
      </ul>}
    </li>}
  </>;
}

export function PanelDelegado() {
  const acceso = useMiAccesoAdmin();
  const uid = useUid();
  const [elegido, setElegido] = useState<Permiso | "">("");
  const [pagina, setPagina] = useState(0);
  const invitacion = acceso.data;
  const seccion = elegido && invitacion?.permisos.includes(elegido) ? elegido : invitacion?.permisos[0];
  const aceptar = useCasosMutation(async (id: string) => accion("aceptar_invitacion_admin", { p_id: id }));
  const registros = useQuery({
    queryKey: ["admin", uid, "delegado", seccion, pagina],
    enabled: Boolean(invitacion?.estado === "activa" && seccion && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("admin_consultar_delegado", { p_seccion: seccion, p_offset: pagina * 20 });
      if (error) throw new Error(error.message);
      return data as Registro[];
    },
  });
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
    <h1 className="font-display text-3xl font-extrabold text-pino">Acceso administrativo</h1>
    {acceso.isPending && <p>Consultando acceso…</p>}
    {acceso.isError && <p role="alert">No se pudo consultar el acceso administrativo.</p>}
    {acceso.isSuccess && !invitacion && <p>No tienes una invitación administrativa vigente.</p>}
    {invitacion?.estado === "pendiente" && <section className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <p>Te invitaron a consultar {invitacion.permisos.map((p) => modulos[p]).join(", ")}.</p>
      <Boton disabled={aceptar.isPending} onClick={() => aceptar.mutate(invitacion.id)}>Aceptar invitación</Boton>
      {aceptar.isError && <p role="alert" className="text-error">{aceptar.error.message}</p>}
    </section>}
    {invitacion?.estado === "activa" && <>
      <label className="block max-w-xs text-sm font-bold">Sección
        <select className="mt-1 block min-h-11 w-full rounded-lg border border-borde bg-white px-3" value={seccion}
          onChange={(e) => { setElegido(e.target.value as Permiso); setPagina(0); }}>
          {invitacion.permisos.map((p) => <option key={p} value={p}>{modulos[p]}</option>)}
        </select>
      </label>
      {registros.isPending && <p>Cargando registros…</p>}
      {registros.isError && <p role="alert" className="text-error">{registros.error.message}</p>}
      {registros.data?.length === 0 && <p>No hay registros en esta sección.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {registros.data?.slice(0, 20).map((fila) => <li key={fila.id} className="rounded-xl border border-borde bg-white p-4">
          <p className="break-words font-bold capitalize text-pino">{fila.titulo.replace(/_/g, " ")}</p>
          <p className="text-sm capitalize text-suave">{fila.estado.replace(/_/g, " ")}
            {fila.fecha && ` · ${new Date(fila.fecha).toLocaleString("es-PE")}`}</p>
        </li>)}
      </ul>
      {(pagina > 0 || (registros.data?.length ?? 0) > 20) && <div className="flex gap-2">
        <Boton variante="contorno" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
        <Boton variante="contorno" disabled={(registros.data?.length ?? 0) <= 20} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
      </div>}
    </>}
  </main>;
}
