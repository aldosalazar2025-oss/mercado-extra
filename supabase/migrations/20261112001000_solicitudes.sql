-- MERCADO EXTRA · Etapa 8 · Solicitudes de compradores

-- 1) Reglas de modificación, renovación y vencimiento.
create or replace function public.proteger_solicitud() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or pg_trigger_depth() > 1 or public.is_admin() then
    return new;
  end if;
  if new.buyer_id is distinct from old.buyer_id
     or new.selected_offer_id is distinct from old.selected_offer_id
     or new.renewed_count is distinct from old.renewed_count then
    raise exception 'Campo reservado al sistema' using errcode = '42501';
  end if;
  -- El contenido solo se edita mientras no hay ofertas (para no cambiar las reglas a mitad de camino).
  if (new.title is distinct from old.title or new.description is distinct from old.description
      or new.category_id is distinct from old.category_id or new.attributes is distinct from old.attributes
      or new.max_budget is distinct from old.max_budget or new.budget_negotiable is distinct from old.budget_negotiable)
     and old.status not in ('abierta', 'vencida') then
    raise exception 'La solicitud ya no se puede modificar porque recibió ofertas o fue cerrada' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'cancelada' and old.status in ('abierta', 'con_ofertas', 'vencida') then
      null;
    elsif new.status = 'eliminada' and old.status in ('abierta', 'con_ofertas', 'vencida', 'cancelada') then
      null;
    elsif new.status = 'abierta' and old.status = 'vencida' then
      if old.renewed_count >= 5 then
        raise exception 'Alcanzaste el máximo de renovaciones. Publica una solicitud nueva.' using errcode = '42501';
      end if;
      new.expires_at := now() + interval '24 hours';
      new.renewed_count := old.renewed_count + 1;
      return new;
    elsif new.status = 'vencida' and old.status = 'abierta' and old.expires_at <= now() then
      null; -- el plazo ya pasó: reflejar la realidad
    else
      raise exception 'Cambio de estado de solicitud no permitido' using errcode = '42501';
    end if;
  end if;
  new.expires_at := old.expires_at;
  return new;
end $$;

-- 2) Máximo de solicitudes abiertas por comprador (contra el spam).
create or replace function public.limitar_solicitudes_abiertas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.es_servicio() or public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.requests r where r.buyer_id = new.buyer_id and r.status in ('abierta', 'con_ofertas')) >= 10 then
    raise exception 'Tienes demasiadas solicitudes abiertas (máximo 10). Cierra alguna antes de publicar otra.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_requests_limitar before insert on public.requests
  for each row execute function public.limitar_solicitudes_abiertas();

-- 3) Fotos de referencia: máximo 5 y solo de la carpeta de la propia solicitud.
create or replace function public.validar_imagen_solicitud() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.path not like new.request_id::text || '/%' then
    raise exception 'La imagen debe estar en la carpeta de la solicitud' using errcode = '23514';
  end if;
  if (select count(*) from public.request_images where request_id = new.request_id) >= 5 then
    raise exception 'Una solicitud admite hasta 5 fotos' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_request_images_validar before insert on public.request_images
  for each row execute function public.validar_imagen_solicitud();
create index idx_request_images_request on public.request_images (request_id);

create policy "solicitud_img_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'request-images' and exists (
    select 1 from public.requests r where r.id = public.try_uuid((storage.foldername(name))[1]) and r.buyer_id = auth.uid()));

-- 4) Vencimiento: las solicitudes abiertas sin ofertas pasan a "vencida" y se avisa al comprador.
--    Es seguro llamarla cuantas veces se quiera (solo aplica la regla del tiempo).
--    Las solicitudes que ya recibieron ofertas NO vencen: el comprador aún puede elegir.
create or replace function public.vencer_solicitudes() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  with v as (
    update public.requests set status = 'vencida'
    where status = 'abierta' and expires_at <= now()
    returning id, buyer_id, title
  )
  insert into public.notifications (user_id, type, title, body, payload)
  select buyer_id, 'solicitud_vencida', 'Tu solicitud venció sin ofertas',
         'Tu solicitud «' || title || '» no recibió ofertas en 24 horas. Puedes renovarla, modificarla o eliminarla.',
         jsonb_build_object('request_id', id)
  from v;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.vencer_solicitudes() from public, anon;
grant execute on function public.vencer_solicitudes() to authenticated;
