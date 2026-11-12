// DATOS FICTICIOS para la etapa de diseño. No son tiendas ni precios reales.
export const categorias = ["Ropa", "Calzado", "Ferretería", "Abarrotes", "Electrónica", "Hogar", "Útiles escolares"];

export type Producto = { id: string; nombre: string; precio: number; tienda: string; categoria: string; distanciaKm: number; disponible: boolean };
export const productos: Producto[] = [
  { id: "p1", nombre: "Saco negro de vestir, talla M", precio: 149, tienda: "Moda Andina", categoria: "Ropa", distanciaKm: 0.4, disponible: true },
  { id: "p2", nombre: "Zapatillas deportivas, talla 40", precio: 129.9, tienda: "Paso Firme", categoria: "Calzado", distanciaKm: 1.2, disponible: true },
  { id: "p3", nombre: "Taladro percutor 650 W", precio: 219, tienda: "Ferretería El Tornillo", categoria: "Ferretería", distanciaKm: 0.8, disponible: true },
  { id: "p4", nombre: "Arroz extra, saco de 50 kg", precio: 205, tienda: "Abarrotes La Esquina", categoria: "Abarrotes", distanciaKm: 0.3, disponible: false },
  { id: "p5", nombre: "Audífonos inalámbricos", precio: 89, tienda: "Tecno Plaza", categoria: "Electrónica", distanciaKm: 2.1, disponible: true },
  { id: "p6", nombre: "Juego de ollas de acero, 5 piezas", precio: 175, tienda: "Casa Elegante", categoria: "Hogar", distanciaKm: 1.6, disponible: true },
];

export type Tienda = { id: string; nombre: string; categorias: string[]; distanciaKm: number; calificacion: number; ventas: number; domicilio: boolean; recojo: boolean };
export const tiendas: Tienda[] = [
  { id: "t1", nombre: "Moda Andina", categorias: ["Ropa"], distanciaKm: 0.4, calificacion: 4.8, ventas: 132, domicilio: true, recojo: true },
  { id: "t2", nombre: "Ferretería El Tornillo", categorias: ["Ferretería", "Hogar"], distanciaKm: 0.8, calificacion: 4.6, ventas: 87, domicilio: true, recojo: true },
  { id: "t3", nombre: "Paso Firme", categorias: ["Calzado"], distanciaKm: 1.2, calificacion: 4.5, ventas: 64, domicilio: false, recojo: true },
  { id: "t4", nombre: "Tecno Plaza", categorias: ["Electrónica"], distanciaKm: 2.1, calificacion: 4.9, ventas: 210, domicilio: true, recojo: false },
];

export const ofertasEjemplo = [
  { tienda: "Moda Andina", precio: 149, detalle: "Talla M · entrega hoy", calificacion: 4.8 },
  { tienda: "Casa Elegante", precio: 165, detalle: "Talla M · recojo en tienda", calificacion: 4.6 },
  { tienda: "Boutique Sol", precio: 178, detalle: "Talla M · envío mañana", calificacion: 4.9 },
];
