-- MERCADO EXTRA · Etapa 11 · Chat privado entre comprador y tienda
-- Las conversaciones ya se crean al elegir una oferta (Etapa 10). Aquí: lectura, avisos, límites y tiempo real.

-- 1) Marca de lectura por persona y conversación (solo se escribe con la función marcar_conversacion_leida).
create table public.message_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.message_reads enable row level security;
revoke all on public.message_reads from anon;
revoke insert, update, delete on public.message_reads from authenticated;
create policy message_reads_select on public.message_reads for select to authenticated using (user_id = auth.uid());

create index idx_messages_sender_reciente on public.messages (sender_id, conversation_id, created_at desc);

-- 2) Reglas al enviar: fotos solo de la carpeta de la conversación y tope de velocidad (contra el spam).
create or replace function public.mensaje_antes_insertar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() then return new; end if;
  if new.image_path is not null and new.image_path not like new.conversation_id::text || '/%' then
    raise exception 'La foto debe estar en la carpeta de la conversación' using errcode = '23514';
  end if;
  if (select count(*) from public.messages m
      where m.sender_id = new.sender_id and m.conversation_id = new.conversation_id
        and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Estás enviando mensajes muy rápido. Espera un momento.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_messages_antes_insertar before insert on public.messages
  for each row execute function public.mensaje_antes_insertar();

-- 3) Avisos de mensajes nuevos, agrupados: mientras haya uno sin leer de la misma conversación, se actualiza en vez de crear otro.
create or replace function public.notificar_mensaje(
  p_user uuid, p_conv uuid, p_order uuid, p_request uuid, p_para text, p_titulo text, p_cuerpo text
) returns void
language sql security definer set search_path = public, pg_temp as $$
  with upd as (
    update public.notifications
       set title = p_titulo, body = p_cuerpo, created_at = now(),
           payload = jsonb_set(payload, '{cantidad}', to_jsonb(coalesce((payload ->> 'cantidad')::int, 1) + 1))
     where user_id = p_user and type = 'mensaje_nuevo' and read_at is null and payload ->> 'conversation_id' = p_conv::text
    returning id
  )
  insert into public.notifications (user_id, type, title, body, payload)
  select p_user, 'mensaje_nuevo', p_titulo, p_cuerpo,
         jsonb_build_object('conversation_id', p_conv, 'order_id', p_order, 'request_id', p_request, 'para', p_para, 'cantidad', 1)
  where not exists (select 1 from upd)
$$;
revoke all on function public.notificar_mensaje(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.mensaje_despues_insertar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.conversations; v_titulo text; v_tienda text; v_comprador text; v_vista text; x record;
begin
  if public.es_servicio() then return new; end if;
  select * into c from public.conversations where id = new.conversation_id;
  select title into v_titulo from public.requests where id = c.request_id;
  select name into v_tienda from public.stores where id = c.store_id;
  select split_part(full_name, ' ', 1) into v_comprador from public.profiles where id = c.buyer_id;
  v_vista := left(coalesce(nullif(new.body, ''), 'Te envió una foto'), 100);

  if new.sender_id = c.buyer_id then
    for x in select q.u from public.usuarios_con_permiso(c.store_id, 'chat') as q(u) where q.u <> new.sender_id loop
      perform public.notificar_mensaje(x.u, c.id, c.order_id, c.request_id, 'vendedor',
        'Mensaje de ' || coalesce(nullif(v_comprador, ''), 'un comprador'), coalesce(v_titulo, 'Pedido') || ': ' || v_vista);
    end loop;
  else
    perform public.notificar_mensaje(c.buyer_id, c.id, c.order_id, c.request_id, 'comprador',
      'Mensaje de ' || v_tienda, coalesce(v_titulo, 'Pedido') || ': ' || v_vista);
  end if;
  return new;
end $$;
create trigger trg_messages_despues_insertar after insert on public.messages
  for each row execute function public.mensaje_despues_insertar();

-- 4) Lista de conversaciones de la persona, con el último mensaje y cuántos sin leer.
create or replace function public.mis_conversaciones() returns table (
  conversation_id uuid, request_id uuid, order_id uuid, solicitud text, store_id uuid, tienda text,
  buyer_id uuid, comprador text, estado text, estado_pedido text, precio_acordado numeric, mi_rol text,
  ultimo_texto text, ultimo_tiene_foto boolean, ultimo_envio timestamptz, no_leidos bigint
)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.request_id, c.order_id, r.title, c.store_id, s.name, c.buyer_id, split_part(p.full_name, ' ', 1),
         c.status, o.status::text, o.agreed_price,
         case when c.buyer_id = auth.uid() then 'comprador' else 'vendedor' end,
         lm.body, coalesce(lm.image_path is not null, false), lm.created_at,
         (select count(*) from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz))
  from public.conversations c
  join public.requests r on r.id = c.request_id
  join public.stores s on s.id = c.store_id
  join public.profiles p on p.id = c.buyer_id
  left join public.orders o on o.id = c.order_id
  left join public.message_reads rd on rd.conversation_id = c.id and rd.user_id = auth.uid()
  left join lateral (select m.body, m.image_path, m.created_at from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
  where auth.uid() is not null
    and (c.buyer_id = auth.uid() or c.store_id in (select public.tiendas_con_permiso('chat')))
  order by coalesce(lm.created_at, c.created_at) desc
$$;

-- 5) Marcar una conversación como leída (y sus avisos).
create or replace function public.marcar_conversacion_leida(p_conversation uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.can_access_conversation(p_conversation) then
    raise exception 'No tienes acceso a esta conversación' using errcode = '42501';
  end if;
  insert into public.message_reads (conversation_id, user_id, last_read_at) values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  update public.notifications set read_at = now()
   where user_id = auth.uid() and type = 'mensaje_nuevo' and read_at is null and payload ->> 'conversation_id' = p_conversation::text;
end $$;

revoke all on function public.mis_conversaciones() from public, anon;
revoke all on function public.marcar_conversacion_leida(uuid) from public, anon;
grant execute on function public.mis_conversaciones() to authenticated;
grant execute on function public.marcar_conversacion_leida(uuid) to authenticated;

-- 6) Tiempo real de los mensajes (cada persona solo recibe los que sus permisos le dejan ver).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
