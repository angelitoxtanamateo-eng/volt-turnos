-- =====================================================================
-- Módulos de reserva configurables por negocio (GUIA_MAESTRA §2 y §3).
-- El rubro solo sugiere qué viene activado; cada negocio puede activar
-- o desactivar Turnos, Clases con cupos y Pedidos por unidad.
-- No borra ni cambia datos existentes.
-- =====================================================================

-- Rubros de la guía
alter table public.businesses drop constraint businesses_category_check;
alter table public.businesses add constraint businesses_category_check check (category in (
  'peluqueria','barberia','unas','estetica','spa','gimnasio','entrenador','gastronomia','consultorio',
  'oficios','tecnico','hogar','clases','academia','alquiler','veterinaria','otro'));

-- {} = usar lo que sugiere el rubro. Solo se guardan las claves que el negocio cambió.
alter table public.businesses add column modules jsonb not null default '{}'::jsonb
  check (jsonb_typeof(modules) = 'object');

create or replace function public.business_modules(p_category text, p_modules jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'turnos',  coalesce((p_modules->>'turnos')::boolean,  p_category not in ('gastronomia')),
    'clases',  coalesce((p_modules->>'clases')::boolean,  p_category in ('gimnasio','entrenador','clases','academia','otro')),
    'pedidos', coalesce((p_modules->>'pedidos')::boolean, p_category in ('gastronomia','otro')));
$$;

-- Al menos un módulo de reserva activo, y solo claves conocidas con valores sí/no
create or replace function public.businesses_check_modules()
returns trigger language plpgsql set search_path = '' as $$
declare m jsonb; k text;
begin
  for k in select jsonb_object_keys(new.modules) loop
    if k not in ('turnos','clases','pedidos') or jsonb_typeof(new.modules->k) <> 'boolean' then
      raise exception 'Módulo desconocido: %', k using errcode = '22023';
    end if;
  end loop;
  m := public.business_modules(new.category, new.modules);
  if not ((m->>'turnos')::boolean or (m->>'clases')::boolean or (m->>'pedidos')::boolean) then
    raise exception 'Dejá al menos una forma de reservar activada' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger trg_businesses_check_modules before insert or update of modules, category on public.businesses
  for each row execute function public.businesses_check_modules();

-- Un servicio nuevo (o que cambia de tipo) tiene que pertenecer a un módulo activo
create or replace function public.services_check_module()
returns trigger language plpgsql set search_path = '' as $$
declare m jsonb; v_kind text;
begin
  if tg_op = 'UPDATE' and new.capacity is not distinct from old.capacity and new.unit_label is not distinct from old.unit_label then
    return new;
  end if;
  select public.business_modules(b.category, b.modules) into m from public.businesses b where b.id = new.business_id;
  v_kind := case when new.unit_label is not null then 'pedidos' when new.capacity > 1 then 'clases' else 'turnos' end;
  if not coalesce((m->>v_kind)::boolean, false) then
    raise exception 'Activá el módulo "%" en Mi negocio para cargar este tipo de servicio',
      case v_kind when 'pedidos' then 'Pedidos por unidad' when 'clases' then 'Clases con cupos' else 'Turnos' end
      using errcode = '22023';
  end if;
  return new;
end $$;
create trigger trg_services_check_module before insert or update of capacity, unit_label on public.services
  for each row execute function public.services_check_module();

-- Disponibilidad: un servicio de un módulo apagado no se puede reservar
create or replace function public._group_info(p_business uuid, p_service_ids uuid[],
  out ok boolean, out dur int, out cap int, out gid uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_n int; v_found int; v_sum int; v_max int; v_units int; v_class int; v_mincap int; v_classcap int; v_svc uuid; m jsonb;
begin
  ok := false;
  select public.business_modules(category, modules) into m from public.businesses where id = p_business;
  if m is null then return; end if;
  select count(distinct x) into v_n from unnest(p_service_ids) x;
  select count(*), coalesce(sum(duration_min), 0), coalesce(max(duration_min), 0),
         count(*) filter (where unit_label is not null),
         count(*) filter (where unit_label is null and capacity > 1),
         min(capacity) filter (where unit_label is not null),
         max(capacity) filter (where unit_label is null and capacity > 1),
         (array_agg(id) filter (where unit_label is null and capacity > 1))[1]
    into v_found, v_sum, v_max, v_units, v_class, v_mincap, v_classcap, v_svc
    from public.services where business_id = p_business and is_active and id = any(p_service_ids);
  if v_n = 0 or v_found <> v_n then return; end if;
  if v_units > 0 then
    if v_units <> v_n or not (m->>'pedidos')::boolean then return; end if;
    ok := true; dur := v_max; cap := v_mincap; gid := p_business; return;
  end if;
  if v_class > 0 then
    if v_n > 1 or not (m->>'clases')::boolean then return; end if;
    ok := true; dur := v_sum; cap := v_classcap; gid := v_svc; return;
  end if;
  if not (m->>'turnos')::boolean then return; end if;
  ok := true; dur := v_sum; cap := 1; gid := null;
end $$;
revoke execute on function public._group_info(uuid, uuid[]) from public, anon, authenticated;

-- Catálogo público: muestra solo lo de los módulos activos
create or replace function public.get_booking_catalog(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category, 'description', b.description,
      'logo_url', b.logo_url, 'cover_url', b.cover_url, 'template', b.template, 'gallery', b.gallery,
      'primary_color', b.primary_color, 'secondary_color', b.secondary_color, 'background_color', b.background_color,
      'socials', b.socials, 'phone', b.phone, 'whatsapp', b.whatsapp, 'address', b.address, 'city', b.city,
      'timezone', b.timezone, 'is_published', b.is_published, 'max_days_ahead', b.max_days_ahead,
      'cancel_limit_hours', b.cancel_limit_hours, 'modules', m.m,
      'accepting', b.booking_enabled and public.business_usable(b.id)),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
                       'duration_min', s.duration_min, 'price_ars', s.price_ars,
                       'capacity', s.capacity, 'unit_label', s.unit_label, 'max_qty', s.max_qty) order by s.sort_order, s.name)
      from public.services s where s.business_id = b.id and s.is_active
        and (m.m->>(case when s.unit_label is not null then 'pedidos' when s.capacity > 1 then 'clases' else 'turnos' end))::boolean
        and exists (select 1 from public.professional_services ps join public.professionals p on p.id = ps.professional_id
                    where ps.service_id = s.id and p.is_active)), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty, 'photo_url', p.photo_url,
                       'service_ids', (select coalesce(jsonb_agg(ps.service_id), '[]'::jsonb) from public.professional_services ps where ps.professional_id = p.id))
                       order by p.sort_order, p.name)
      from public.professionals p where p.business_id = b.id and p.is_active), '[]'::jsonb)
  )
  from public.businesses b
  cross join lateral (select public.business_modules(b.category, b.modules) as m) m
  where b.slug = lower(p_slug) and b.status = 'active'
    and (b.is_published or public.has_business_role(b.id, array['owner','admin','professional']) or public.is_platform_admin());
$$;

revoke execute on function public.businesses_check_modules() from public, anon, authenticated;
revoke execute on function public.services_check_module() from public, anon, authenticated;
