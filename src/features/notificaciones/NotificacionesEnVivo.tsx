import { useNotificacionesEnVivo } from "./hooks";

// Se monta una sola vez en toda la aplicación.
export default function NotificacionesEnVivo() {
  useNotificacionesEnVivo();
  return null;
}
