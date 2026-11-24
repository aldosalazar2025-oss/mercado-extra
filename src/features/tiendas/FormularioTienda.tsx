import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import Campo, { estiloInput } from "@/components/Campo";
import { comprimirImagen } from "@/lib/imagen";
import { supabase } from "@/lib/supabase";
import type { Tienda } from "./tipos";

type Props = { inicial?: Tienda; categoriasIniciales?: string[]; onGuardado: (id: string) => void };

const claveMapas = import.meta.env.VITE_GEOAPIFY_API_KEY?.trim();

async function buscarDireccion(lat: number, lng: number, apiKey: string) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "json", lang: "es", limit: "1", apiKey });
  const respuesta = await fetch(`https://api.geoapify.com/v1/geocode/reverse?${params}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!respuesta.ok) throw new Error("No se pudo consultar la dirección.");
  const { results } = await respuesta.json() as { results?: {
    street?: string; housenumber?: string; district?: string; suburb?: string; city?: string;
  }[] };
  const lugar = results?.[0];
  const distrito = lugar?.district || lugar?.city || lugar?.suburb;
  const calle = [lugar?.street, lugar?.street && lugar.housenumber].filter(Boolean).join(" ");
  return {
    texto: [...new Set([calle, distrito].filter(Boolean))].join(", "),
    completa: Boolean(calle && lugar?.housenumber && distrito),
  };
}

export default function FormularioTienda({ inicial, categoriasIniciales = [], onGuardado }: Props) {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState(inicial?.name ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.description ?? "");
  const [direccion, setDireccion] = useState(inicial?.address ?? "");
  const [telefono, setTelefono] = useState(inicial?.phone ?? "");
  const [ruc, setRuc] = useState(inicial?.business_id ?? "");
  const [lat, setLat] = useState<number | null>(inicial?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(inicial?.longitude ?? null);
  const [domicilio, setDomicilio] = useState(inicial?.offers_delivery ?? false);
  const [recojo, setRecojo] = useState(inicial?.offers_pickup ?? true);
  const [cats, setCats] = useState<string[]>(categoriasIniciales);
  const [logo, setLogo] = useState<File | null>(null);
  const [miniaturaLogo, setMiniaturaLogo] = useState<string | null>(null);
  const selectorLogo = useRef<HTMLInputElement>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const [avisoUbicacion, setAvisoUbicacion] = useState("");
  const revisionDireccion = useRef(0);

  useEffect(() => {
    if (!logo) {
      setMiniaturaLogo(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setMiniaturaLogo(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => {
      if (!supabase) return [];
      const { data } = await supabase.from("categories").select("id,name").eq("active", true).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  function usarUbicacion() {
    if (!navigator.geolocation) return setAvisoUbicacion("Tu navegador no permite obtener la ubicación.");
    setUbicando(true);
    setAvisoUbicacion("");
    const revision = revisionDireccion.current;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const latitud = Number(coords.latitude.toFixed(6));
        const longitud = Number(coords.longitude.toFixed(6));
        setLat(latitud);
        setLng(longitud);
        try {
          if (!claveMapas) {
            setAvisoUbicacion("Ubicación detectada. Completa la dirección a mano.");
            return;
          }
          const sugerencia = await buscarDireccion(latitud, longitud, claveMapas);
          if (sugerencia.texto && revision === revisionDireccion.current) {
            setDireccion(sugerencia.texto);
            setErrores((actuales) => ({ ...actuales, direccion: "" }));
            setAvisoUbicacion(sugerencia.completa ? "Esta es tu ubicación." : "Esta es tu ubicación. Completa los datos que falten.");
          } else if (!sugerencia.texto) {
            setAvisoUbicacion("No encontramos una dirección para esta ubicación. Puedes escribirla a mano.");
          }
        } catch {
          setAvisoUbicacion("No pudimos consultar la dirección. Puedes escribirla a mano.");
        } finally {
          setUbicando(false);
        }
      },
      () => {
        setUbicando(false);
        setAvisoUbicacion("No pudimos obtener tu ubicación. Revisa el permiso del navegador.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (ubicando || enviando) return;
    setError(null);
    const n: Record<string, string> = {};
    if (nombre.trim().length < 2) n.nombre = "Escribe el nombre comercial de la tienda.";
    if (direccion.trim().length < 5) n.direccion = "Escribe la dirección de la tienda.";
    if (telefono.trim() !== "" && !/^[0-9]{7,9}$/.test(telefono.trim())) n.telefono = "Escribe solo números (de 7 a 9 dígitos).";
    if (ruc.trim() !== "" && !/^[0-9]{11}$/.test(ruc.trim())) n.ruc = "El RUC tiene 11 números.";
    if (cats.length === 0) n.cats = "Elige al menos una categoría.";
    if (!domicilio && !recojo) n.entrega = "Elige al menos una forma de entrega.";
    setErrores(n);
    if (Object.keys(n).length > 0 || !supabase) return;

    setEnviando(true);
    try {
      const id = inicial?.id ?? crypto.randomUUID();
      const campos = {
        name: nombre.trim(),
        description: descripcion.trim() || null,
        address: direccion.trim(),
        phone: telefono.trim() || null,
        business_id: ruc.trim() || null,
        latitude: lat,
        longitude: lng,
        offers_delivery: domicilio,
        offers_pickup: recojo,
      };
      if (inicial) {
        const r = await supabase.from("stores").update(campos).eq("id", id).select("id");
        if (r.error || !r.data || r.data.length === 0) throw new Error("No se pudo guardar la tienda. Puede que no tengas permiso para editarla.");
        await supabase.from("store_categories").delete().eq("store_id", id);
      } else {
        const { data: s } = await supabase.auth.getSession();
        const r = await supabase.from("stores").insert({ id, owner_id: s.session?.user.id, ...campos, status: "pendiente" });
        if (r.error) throw new Error("No se pudo registrar la tienda.");
      }
      const rc = await supabase.from("store_categories").insert(cats.map((category_id) => ({ store_id: id, category_id })));
      if (rc.error) throw new Error("La tienda se guardó, pero no se pudieron guardar las categorías.");

      if (logo) {
        const blob = await comprimirImagen(logo, 800);
        const ruta = `${id}/logo-${Date.now()}.jpg`;
        const up = await supabase.storage.from("public-catalog").upload(ruta, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error("La tienda se guardó, pero no se pudo subir el logotipo.");
        await supabase.from("stores").update({ logo_path: ruta }).eq("id", id);
      }
      await cliente.invalidateQueries({ queryKey: ["mis-tiendas"] });
      await cliente.invalidateQueries({ queryKey: ["tienda", id] });
      onGuardado(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-xl border border-borde bg-white p-5" noValidate>
      <Campo etiqueta="Nombre comercial" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
      <Campo etiqueta="Descripción" id="tienda-descripcion">
        <textarea id="tienda-descripcion" rows={3} className={estiloInput} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué vendes y qué te distingue" />
      </Campo>
      <Campo etiqueta="Dirección" value={direccion} onChange={(e) => {
        revisionDireccion.current += 1;
        setDireccion(e.target.value);
      }} placeholder="Calle, número, distrito" error={errores.direccion} />
      <div className="space-y-1">
        <Boton type="button" variante="contorno" onClick={usarUbicacion} disabled={ubicando}>
          {ubicando ? "Buscando ubicación…" : "Usar mi ubicación actual"}
        </Boton>
        <p role="status" className="text-sm text-suave">{avisoUbicacion ||
          (claveMapas ? "Geoapify usa tus coordenadas para sugerir la dirección." : "Hazlo estando en la tienda.")}</p>
      </div>
      <Campo etiqueta="Teléfono (opcional)" inputMode="tel" maxLength={9} value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ""))} error={errores.telefono} />
      <Campo etiqueta="RUC (opcional)" inputMode="numeric" maxLength={11} value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, ""))} error={errores.ruc} />
      <fieldset>
        <legend className="font-bold">Categorías que vendes</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {categorias.data?.map((c) => (
            <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${cats.includes(c.id) ? "border-mercado bg-hoja" : "border-borde"}`}>
              <input type="checkbox" className="h-4 w-4 accent-[#1e6b45]" checked={cats.includes(c.id)} onChange={(e) => setCats(e.target.checked ? [...cats, c.id] : cats.filter((x) => x !== c.id))} />
              {c.name}
            </label>
          ))}
        </div>
        {errores.cats && <p className="mt-1 text-sm font-semibold text-error">{errores.cats}</p>}
      </fieldset>
      <fieldset>
        <legend className="font-bold">Formas de entrega</legend>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#1e6b45]" checked={domicilio} onChange={(e) => setDomicilio(e.target.checked)} /> Entrega a domicilio</label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#1e6b45]" checked={recojo} onChange={(e) => setRecojo(e.target.checked)} /> Recojo en tienda</label>
        {errores.entrega && <p className="text-sm font-semibold text-error">{errores.entrega}</p>}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-bold">Logotipo (opcional)</legend>
        <input ref={selectorLogo} type="file" hidden accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap items-center gap-2">
          {miniaturaLogo && <img src={miniaturaLogo} alt="Vista previa del logotipo"
            className="size-20 rounded-lg border border-borde bg-white object-contain" />}
          <Boton type="button" variante="contorno" onClick={() => selectorLogo.current?.click()}>
            {logo ? "Cambiar foto" : "Añadir foto"}
          </Boton>
          {logo && <span className="min-w-0 break-all text-sm text-suave">{logo.name}</span>}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <Boton type="submit" variante="primario" disabled={enviando || ubicando}>{enviando ? "Guardando…" : inicial ? "Guardar cambios" : "Registrar tienda"}</Boton>
    </form>
  );
}
