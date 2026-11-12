-- MERCADO EXTRA · Etapa 4 · Tablas, relaciones, restricciones e índices
-- Moneda: soles (PEN). Todos los datos de prueba son ficticios.

-- ───────── Categorías ─────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────── Perfiles e identidad ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  is_buyer boolean not null default true,
  is_seller boolean not null default false,
  is_admin boolean not null default false,
  status public.cuenta_estado not null default 'activo',
  consent_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  dni text not null check (dni ~ '^[0-9]{8}$'),
  dni_photo_path text,
  selfie_path text,
  status public.verificacion_estado not null default 'pendiente',
  rejection_reason text,
  consent_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now()
);

-- ───────── Roles y permisos de tienda ─────────
create table public.roles (
  code text primary key,
  name text not null
);
create table public.permissions (
  code text primary key,
  description text not null
);
create table public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- ───────── Tiendas ─────────
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 2 and 100),
  description text,
  logo_path text,
  address text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text,
  business_id text,
  status public.tienda_estado not null default 'pendiente',
  rejection_reason text,
  offers_delivery boolean not null default false,
  offers_pickup boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (offers_delivery or offers_pickup)
);
create table public.store_categories (
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (store_id, category_id)
);
create table public.store_photos (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  path text not null,
  sort smallint not null default 0
);
create table public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role_code text not null references public.roles(code),
  invited_email text,
  status public.miembro_estado not null default 'invitado',
  extra_permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (store_id, user_id),
  unique (store_id, invited_email),
  check (user_id is not null or invited_email is not null)
);

-- ───────── Catálogo ─────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  name text not null check (char_length(name) between 2 and 150),
  description text,
  price numeric(12,2) not null check (price >= 0),
  available boolean not null default true,
  status text not null default 'activo' check (status in ('activo', 'oculto', 'eliminado')),
  search_vector tsvector generated always as
    (to_tsvector('spanish'::regconfig, coalesce(name, '') || ' ' || coalesce(description, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  path text not null,
  sort smallint not null default 0
);
create table public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag text not null check (char_length(tag) between 2 and 40),
  primary key (product_id, tag)
);

-- ───────── Solicitudes, coincidencias y ofertas ─────────
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 3 and 120),
  description text,
  category_id uuid references public.categories(id),
  attributes jsonb not null default '{}'::jsonb,
  max_budget numeric(12,2) not null check (max_budget > 0),
  budget_negotiable boolean not null default false,
  status public.solicitud_estado not null default 'abierta',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  renewed_count integer not null default 0,
  selected_offer_id uuid,
  search_vector tsvector generated always as
    (to_tsvector('spanish'::regconfig, coalesce(title, '') || ' ' || coalesce(description, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.request_images (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  path text not null
);
create table public.request_matches (
  request_id uuid not null references public.requests(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  score numeric(6,3) not null default 0,
  matched_by text[] not null default '{}',
  notified_at timestamptz,
  dismissed boolean not null default false,
  primary key (request_id, store_id)
);
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  created_by uuid not null references public.profiles(id),
  current_version_id uuid,
  status public.oferta_estado not null default 'enviada',
  created_at timestamptz not null default now(),
  unique (request_id, store_id)
);
create table public.offer_history (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  version integer not null,
  price numeric(12,2) not null check (price >= 0),
  description text,
  availability text,
  delivery_terms text,
  eta text,
  notes text,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 10),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_by_buyer_at timestamptz,
  unique (offer_id, version)
);
alter table public.offers
  add constraint offers_current_version_fk foreign key (current_version_id) references public.offer_history(id);
alter table public.requests
  add constraint requests_selected_offer_fk foreign key (selected_offer_id) references public.offers(id);

-- ───────── Pedidos y entregas ─────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id),
  offer_version_id uuid not null references public.offer_history(id),
  buyer_id uuid not null references public.profiles(id),
  store_id uuid not null references public.stores(id),
  delivery_mode public.entrega_modo not null,
  status public.pedido_estado not null default 'oferta_aceptada',
  agreed_price numeric(12,2) not null check (agreed_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);
create table public.delivery_evidence (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  type public.evidencia_tipo not null,
  file_path text not null,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now()
);
-- Tabla SIN acceso directo para usuarios: el código solo se obtiene/verifica con funciones (Etapa 12).
create table public.delivery_codes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.delivery_code_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references public.profiles(id),
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create table public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null,
  from_status public.pedido_estado,
  to_status public.pedido_estado,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ───────── Chat ─────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id),
  offer_id uuid references public.offers(id),
  order_id uuid references public.orders(id),
  store_id uuid not null references public.stores(id),
  buyer_id uuid not null references public.profiles(id),
  status text not null default 'activa' check (status in ('activa', 'cerrada')),
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text check (char_length(body) <= 2000),
  image_path text,
  created_at timestamptz not null default now(),
  check (body is not null or image_path is not null)
);

-- ───────── Reputación, cancelaciones, sanciones y reclamos ─────────
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  rater_id uuid not null references public.profiles(id),
  rater_role public.calificador_rol not null,
  rated_id uuid not null references public.profiles(id),
  score smallint not null check (score between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  status text not null default 'visible' check (status in ('visible', 'denunciada', 'oculta')),
  created_at timestamptz not null default now(),
  unique (order_id, rater_role),
  check (rater_id <> rated_id)
);
create table public.rating_reports (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.ratings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id),
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  created_at timestamptz not null default now(),
  unique (rating_id, reporter_id)
);
create table public.cancellations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  request_id uuid references public.requests(id),
  cancelled_by uuid not null references public.profiles(id),
  reason_code public.cancelacion_motivo not null,
  reason_text text,
  evidence_paths text[] not null default '{}',
  review_status public.cancelacion_revision not null default 'sin_revision',
  reported_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (order_id is not null or request_id is not null)
);
create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type public.sancion_tipo not null,
  reason text not null,
  source_type text check (source_type in ('cancelacion', 'reclamo', 'otro')),
  source_id uuid,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  appeal_text text,
  appeal_status text check (appeal_status in ('pendiente', 'aceptada', 'rechazada')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  buyer_id uuid not null references public.profiles(id),
  store_id uuid not null references public.stores(id),
  type public.reclamo_tipo not null,
  description text not null check (char_length(description) between 10 and 3000),
  status public.reclamo_estado not null default 'abierto',
  resolution public.reclamo_resolucion,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('foto', 'video', 'documento')),
  file_path text not null,
  created_at timestamptz not null default now()
);
create table public.claim_responses (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 3000),
  is_appeal boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────── Notificaciones, monetización y auditoría ─────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_month numeric(12,2) not null default 0 check (price_month >= 0),
  benefits jsonb not null default '[]'::jsonb,
  active boolean not null default true
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status public.suscripcion_estado not null default 'activa',
  starts_at timestamptz not null default now(),
  ends_at timestamptz
);
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  kind text not null check (kind in ('tienda_destacada', 'producto_destacado', 'publicacion_promocionada')),
  status public.promocion_estado not null default 'pendiente',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ───────── Índices ─────────
create index idx_stores_owner on public.stores (owner_id);
create index idx_stores_status on public.stores (status);
create index idx_store_members_user on public.store_members (user_id, status);
create index idx_store_members_store on public.store_members (store_id, status);
create index idx_products_store on public.products (store_id, status);
create index idx_products_category on public.products (category_id);
create index idx_products_search on public.products using gin (search_vector);
create index idx_requests_buyer on public.requests (buyer_id, status);
create index idx_requests_category on public.requests (category_id);
create index idx_requests_open_expiry on public.requests (expires_at) where status in ('abierta', 'con_ofertas');
create index idx_requests_search on public.requests using gin (search_vector);
create index idx_matches_store on public.request_matches (store_id);
create index idx_offers_store on public.offers (store_id);
create index idx_offer_history_offer on public.offer_history (offer_id);
create index idx_orders_buyer on public.orders (buyer_id, status);
create index idx_orders_store on public.orders (store_id, status);
create index idx_evidence_order on public.delivery_evidence (order_id);
create index idx_events_order on public.delivery_events (order_id);
create index idx_attempts_order on public.delivery_code_attempts (order_id);
create index idx_conv_buyer on public.conversations (buyer_id);
create index idx_conv_store on public.conversations (store_id);
create index idx_messages_conv on public.messages (conversation_id, created_at);
create index idx_ratings_rated on public.ratings (rated_id, status);
create index idx_claims_buyer on public.claims (buyer_id);
create index idx_claims_store on public.claims (store_id);
create index idx_notifications_user on public.notifications (user_id, read_at);
create index idx_audit_entity on public.audit_logs (entity, entity_id);
create index idx_audit_actor on public.audit_logs (actor_id, created_at);
