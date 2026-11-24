import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Boton from "@/components/Boton";
import { accion } from "@/features/reclamos/casos";

export default function TachoBaja({ id, nombre, tipo }: { id: string; nombre: string; tipo: "usuario" | "tienda" }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState("");
  const cliente = useQueryClient();
  const etiqueta = `Dar de baja a ${nombre}`;
  const baja = useMutation({
    mutationFn: () => accion(`admin_dar_baja_${tipo}`, { p_id: id, p_motivo: motivo.trim() }),
    onSuccess: async () => {
      dialogo.current?.close();
      await Promise.all(["admin", "admin-tiendas"].map((clave) => cliente.invalidateQueries({ queryKey: [clave] })));
    },
  });

  return (
    <>
      <button type="button" aria-label={etiqueta} title={etiqueta}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-error hover:bg-red-50"
        onClick={() => { setMotivo(""); baja.reset(); dialogo.current?.showModal(); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 4v6m4-6v6" />
        </svg>
      </button>
      <dialog ref={dialogo} aria-label={etiqueta}
        onCancel={(evento) => { if (baja.isPending) evento.preventDefault(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-borde bg-white p-5 text-tinta backdrop:bg-black/40">
        <form className="space-y-4" onSubmit={(evento) => {
          evento.preventDefault();
          if (!baja.isPending && motivo.trim().length >= 5) baja.mutate();
        }}>
          <h3 className="font-display text-xl font-bold text-pino">{etiqueta}</h3>
          <p className="text-sm text-suave">Se liberará {tipo === "usuario" ? "el DNI y el correo" : "el RUC"} y se conservará el historial.</p>
          <label className="block text-sm font-semibold">Motivo
            <textarea className="mt-1 block w-full rounded-lg border border-borde p-2 font-normal" rows={3}
              value={motivo} onChange={(evento) => setMotivo(evento.target.value)}
              maxLength={3000} required disabled={baja.isPending} />
          </label>
          {baja.isError && <p role="alert" className="text-sm text-error">{baja.error.message}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Boton type="button" variante="contorno" disabled={baja.isPending} onClick={() => dialogo.current?.close()}>Cancelar</Boton>
            <Boton type="submit" disabled={baja.isPending || motivo.trim().length < 5}>{baja.isPending ? "Guardando…" : "Confirmar baja"}</Boton>
          </div>
        </form>
      </dialog>
    </>
  );
}
