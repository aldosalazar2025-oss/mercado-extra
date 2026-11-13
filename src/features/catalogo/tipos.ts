export type ProductoCatalogo = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  category_id: string;
  category_name: string;
  store_id: string;
  store_name: string;
  store_address: string | null;
  offers_delivery: boolean;
  offers_pickup: boolean;
  distancia_km: number | null;
  image_path: string | null;
  created_at: string;
};

export type Categoria = { id: string; name: string; slug: string; active: boolean };
