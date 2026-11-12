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
