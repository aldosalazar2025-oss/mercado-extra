export type PanelId = "comprador" | "vendedor" | "admin";

export const paneles: Record<PanelId, { titulo: string; secciones: string[] }> = {
  comprador: {
    titulo: "Panel del comprador",
    secciones: ["Inicio", "Explorar productos", "Explorar tiendas", "Mis solicitudes", "Ofertas recibidas", "Mis compras", "Chat", "Reclamos", "Mis calificaciones", "Mi perfil"],
  },
  vendedor: {
    titulo: "Panel del vendedor",
    secciones: ["Resumen", "Mis tiendas", "Mis productos", "Solicitudes recibidas", "Enviar ofertas", "Mis ofertas", "Pedidos", "Chat", "Evidencias de entrega", "Empleados y permisos", "Calificaciones", "Estadísticas", "Promociones y planes"],
  },
  admin: {
    titulo: "Panel administrativo",
    secciones: ["Resumen general", "Usuarios", "Verificación de identidad", "Tiendas", "Categorías", "Productos", "Solicitudes", "Ofertas", "Operaciones", "Reclamos", "Cancelaciones", "Sanciones", "Promociones", "Planes comerciales", "Reportes", "Configuración"],
  },
};

export const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Permiso que pide cada sección del panel de vendedor (null = visible para todos).
// Es solo para ordenar el menú: la protección real está en la base de datos.
export const permisoSeccion: Record<string, string | null> = {
  "Resumen": null,
  "Mis tiendas": null,
  "Mis productos": "gestionar_productos",
  "Solicitudes recibidas": "ver_solicitudes",
  "Enviar ofertas": "enviar_ofertas",
  "Mis ofertas": "enviar_ofertas",
  "Pedidos": "gestionar_pedidos",
  "Chat": "chat",
  "Evidencias de entrega": "gestionar_pedidos",
  "Empleados y permisos": "gestionar_empleados",
  "Calificaciones": "ver_estadisticas",
  "Estadísticas": "ver_estadisticas",
  "Promociones y planes": "gestionar_planes",
};
