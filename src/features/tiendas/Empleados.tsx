import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { supabase } from "@/lib/supabase";
import type { Miembro } from "./tipos";

type Rol = { code: string; name: string };
type Permiso = { code: string; description: string };

function FilaEmpleado({ m, nombre, roles, permisos, incluidos, esPropietario, puedeGestionar, onCambio }: {
  m: Miembro; nombre: string; roles: Rol[]; permisos: Permiso[]; incluidos: string[]; esPropietario: boolean; puedeGestionar: boolean; onCambio: (msg: string) => void;
}) {
  const cliente = useQueryClient();
  const [rol, setRol] = useState(m.role_code);
  const [extras, setExtras] = useState<string[]>(m.extra_permissions);
  const reservados = ["gestionar_planes", "gestionar_empleados"];
  const rolesPermitidos = roles.filter((r) => r.code !== "propietario" && (esPropietario || r.code !== "administrador_tienda"));
  const protegido = m.role_code === "propietario" || (!esPropietario && m.role_code === "administrador_tienda");

  const actualizar = useMutation({
    mutationFn: async (cambios: Partial<Pick<Miembro, "role_code" | "extra_permissions" | "status">>) => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.from("store_members").update(cambios).eq("id", m.id).select("id");
      if (r.error || !r.data || r.data.length === 0) throw new Error("No se pudo guardar el cambio. Puede que no tengas permiso para esto.");
    },
    onSuccess: () => { onCambio("Cambio guardado."); void cliente.invalidateQueries({ queryKey: ["miembros"] }); },
    onError: (e) => onCambio(e instanceof Error ? e.message : "Error"),
  });
  const quitar = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Sin conexión");
      const r = await supabase.from("store_members").delete().eq("id", m.id).select("id");
      if (r.error || !r.data || r.data.length === 0) throw new Error("No se pudo quitar. Puede que no tengas permiso para esto.");
    },
    onSuccess: () => { onCambio("Invitación eliminada."); void cliente.invalidateQueries({ queryKey: ["miembros"] }); },
    onError: (e) => onCambio(e instanceof Error ? e.message : "Error"),
  });

  const descripcion = (code: string) => permisos.find((p) => p.code === code)?.description ?? code;
  const rolNombre = roles.find((r) => r.code === m.role_code)?.name ?? m.role_code;
  const todos = [...new Set([...incluidos, ...m.extra_permissions])];

  if (!puedeGestionar) {
    return (
      <li className="space-y-2 rounded-xl border border-borde bg-white p-4">
        <p className="font-bold">{nombre}</p>
        <p className="text-sm text-suave">Rol: {rolNombre}</p>
        <div>
          <p className="font-bold">Lo que puedes hacer en esta tienda</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {todos.length === 0 ? <li>Sin permisos asignados</li> : todos.map((c) => <li key={c}>{descripcion(c)}</li>)}
          </ul>
        </div>
        <p className="text-sm text-suave">Solo el propietario o un administrador de la tienda puede cambiar estos permisos.</p>
      </li>
    );
  }

  const estadoTexto = m.status === "invitado" ? "Invitación pendiente" : m.status === "revocado" ? "Acceso revocado" : "Activo";
  return (
    <li className="space-y-3 rounded-xl border border-borde bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">{nombre}</p>
          <p className="text-sm text-suave">{estadoTexto}{m.invited_email && m.status === "invitado" ? ` · ${m.invited_email}` : ""}</p>
        </div>
        {protegido && <span className="rounded-full bg-hoja px-3 py-1 text-sm font-bold text-pino">{m.role_code === "propietario" ? "Propietario" : "Administrador de tienda"}</span>}
      </div>
      {!protegido && (
        <>
          <div className="max-w-xs">
            <label htmlFor={`rol-${m.id}`} className="block font-bold">Rol</label>
            <select id={`rol-${m.id}`} className={estiloInput} value={rol} onChange={(e) => setRol(e.target.value)}>
              {rolesPermitidos.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </div>
          {incluidos.length > 0 && (
            <p className="text-sm text-suave">Incluido por su rol: {incluidos.map(descripcion).join(", ")}.</p>
          )}
          <fieldset>
            <legend className="font-bold">Permisos adicionales</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {permisos.filter((p) => esPropietario || !reservados.includes(p.code)).map((p) => (
                <label key={p.code} className="flex min-h-11 items-center gap-2 rounded-lg border border-borde px-3 text-sm" title={p.description}>
                  <input type="checkbox" className="h-4 w-4 accent-[#1e6b45]" checked={extras.includes(p.code)} onChange={(e) => setExtras(e.target.checked ? [...extras, p.code] : extras.filter((x) => x !== p.code))} />
                  {p.description}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" disabled={actualizar.isPending} onClick={() => actualizar.mutate({ role_code: rol, extra_permissions: extras })}>Guardar permisos</Boton>
            {m.status === "activo" && <Boton variante="contorno" disabled={actualizar.isPending} onClick={() => actualizar.mutate({ status: "revocado" })}>Revocar acceso</Boton>}
            {m.status === "revocado" && <Boton variante="contorno" disabled={actualizar.isPending} onClick={() => actualizar.mutate({ status: m.user_id ? "activo" : "invitado" })}>Reactivar</Boton>}
            {m.status === "invitado" && <Boton variante="contorno" disabled={quitar.isPending} onClick={() => quitar.mutate()}>Cancelar invitación</Boton>}
          </div>
        </>
      )}
    </li>
  );
}

export default function Empleados({ tiendaId, esPropietario, puedeGestionar }: { tiendaId: string; esPropietario: boolean; puedeGestionar: boolean }) {
  const cliente = useQueryClient();
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState("vendedor");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const catalogos = useQuery({
    queryKey: ["roles-permisos"],
    queryFn: async () => {
      if (!supabase) return { roles: [] as Rol[], permisos: [] as Permiso[], delRol: [] as { role_code: string; permission_code: string }[] };
      const [r, p, rp] = await Promise.all([
        supabase.from("roles").select("code,name"),
        supabase.from("permissions").select("code,description"),
        supabase.from("role_permissions").select("role_code,permission_code"),
      ]);
      return { roles: (r.data ?? []) as Rol[], permisos: (p.data ?? []) as Permiso[], delRol: (rp.data ?? []) as { role_code: string; permission_code: string }[] };
    },
  });

  const miembros = useQuery({
    queryKey: ["miembros", tiendaId],
    queryFn: async () => {
      if (!supabase) return { lista: [] as Miembro[], nombres: new Map<string, string>() };
      const { data, error } = await supabase.from("store_members").select("id,user_id,role_code,invited_email,status,extra_permissions").eq("store_id", tiendaId).order("created_at");
      if (error) throw error;
      const lista = (data ?? []) as Miembro[];
      const ids = lista.map((m) => m.user_id).filter((x): x is string => Boolean(x));
      const nombres = new Map<string, string>();
      if (ids.length > 0) {
        const n = await supabase.from("perfiles_publicos").select("id,nombre").in("id", ids);
        (n.data ?? []).forEach((x) => nombres.set(x.id as string, (x.nombre as string) || "Empleado"));
      }
      return { lista, nombres };
    },
  });

  const invitar = useMutation({
    mutationFn: async (e: FormEvent) => {
      e.preventDefault();
      if (!supabase) throw new Error("Sin conexión");
      const email = correo.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Escribe un correo válido (el de su cuenta de Google).");
      const r = await supabase.from("store_members").insert({ store_id: tiendaId, invited_email: email, role_code: rol, status: "invitado" });
      if (r.error) throw new Error(r.error.code === "23505" ? "Ese correo ya fue invitado a esta tienda." : "No se pudo enviar la invitación.");
    },
    onSuccess: () => {
      setCorreo("");
      setMensaje("Invitación creada. La persona la verá en «Mi cuenta» al entrar con ese correo de Google.");
      void cliente.invalidateQueries({ queryKey: ["miembros", tiendaId] });
    },
    onError: (e) => setMensaje(e instanceof Error ? e.message : "Error"),
  });

  const roles = catalogos.data?.roles ?? [];
  const rolesInvitables = roles.filter((r) => r.code !== "propietario" && (esPropietario || r.code !== "administrador_tienda"));

  return (
    <div className="space-y-4">
      {mensaje && <p role="status" className="rounded-lg bg-maiz-suave p-3 text-sm">{mensaje}</p>}
      {puedeGestionar ? (
        <form onSubmit={(e) => invitar.mutate(e)} className="grid gap-3 rounded-xl border border-borde bg-white p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end" noValidate>
          <Campo etiqueta="Correo de Google del empleado" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="empleado@gmail.com" />
          <Campo etiqueta="Rol" id="rol-invitacion">
            <select id="rol-invitacion" className={estiloInput} value={rol} onChange={(e) => setRol(e.target.value)}>
              {rolesInvitables.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </Campo>
          <Boton type="submit" variante="primario" disabled={invitar.isPending}>Invitar</Boton>
        </form>
      ) : (
        <p className="rounded-xl bg-white p-4 text-suave">No tienes permiso para administrar empleados en esta tienda.</p>
      )}
      {miembros.isLoading && <p className="text-suave">Cargando…</p>}
      {miembros.error && <p role="alert" className="text-error">No se pudo cargar la lista de empleados.</p>}
      <ul className="space-y-3">
        {miembros.data?.lista.map((m) => (
          <FilaEmpleado
            key={`${m.id}-${m.role_code}-${m.status}-${m.extra_permissions.join()}`}
            m={m}
            nombre={m.user_id ? miembros.data?.nombres.get(m.user_id) ?? "Empleado" : m.invited_email ?? "Invitado"}
            roles={roles}
            permisos={catalogos.data?.permisos ?? []}
            incluidos={(catalogos.data?.delRol ?? []).filter((x) => x.role_code === m.role_code).map((x) => x.permission_code)}
            esPropietario={esPropietario}
            puedeGestionar={puedeGestionar}
            onCambio={setMensaje}
          />
        ))}
      </ul>
    </div>
  );
}
