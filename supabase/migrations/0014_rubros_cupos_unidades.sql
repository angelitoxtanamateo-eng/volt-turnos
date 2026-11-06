-- =====================================================================
-- Rubros nuevos (gimnasios, gastronomía, consultorios, oficios, clases),
-- clases con cupos (varios clientes en el mismo horario) y
-- venta por unidad (ej: empanadas por docena, el cliente elige la cantidad).
-- =====================================================================

-- ---------- Rubros y plantillas ----------
alter table public.businesses drop constraint businesses_category_check;
alter table public.businesses add constraint businesses_category_check
  check (category in ('peluqueria','barberia','unas','estetica','spa','gimnasio','gastronomia','consultorio','oficios','clases','otro'));
alter table public.businesses drop constraint businesses_template_check;
alter table public.businesses add constraint businesses_template_check
  check (template in ('barberia','peluqueria','nails','estetica','unisex','gym','food'));

-- ---------- Servicios: cupos y unidad ----------
alter table public.services
  add column capacity   int  not null default 1 check (capacity between 1 and 500),
  add column unit_label text check (unit_label is null or char_length(unit_label) between 1 and 20),
  add column max_qty    int  not null default 1 check (max_qty between 1 and 999);

alter table public.appointment_services
  add column quantity   int  not null default 1 check (quantity between 1 and 999),
  add column unit_label text;

-- ---------- Turnos grupales ----------
-- session_key: los turnos de una misma clase (mismo servicio grupal, mismo inicio) comparten clave
-- y pueden superponerse entre sí; con cualquier otro turno siguen sin poder pisarse.
alter table public.appointments
  add column group_service_id uuid,
  add column session_key text;
update public.appointments set session_key = id::text;
alter table public.appointments alter column session_key set not null;

create or replace function public.appointments_session_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.session_key := case
    when new.group_service_id is null then new.id::text
    else new.group_service_id::text || '@' || extract(epoch from new.starts_at)::bigint::text end;
  return new;
end $$;
create trigger trg_appointments_session_key before insert or update on public.appointments
  for each row execute function public.appointments_session_key();

alter table public.appointments drop constraint no_overlap;
alter table public.appointments add constraint no_overlap exclude using gist (
  professional_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&,
  session_key with <>
) where (status <> 'cancelled');
create index idx_appointments_session on public.appointments(professional_id, session_key) where status <> 'cancelled';

-- ---------- Disponibilidad ----------
drop function if exists public._pro_is_free(uuid, timestamptz, timestamptz, uuid);
create function public._pro_is_free(p_pro uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null, p_session text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
      select 1 from public.appointments a
      where a.professional_id = p_pro and a.status <> 'cancelled'
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
        and (p_exclude is null or a.id <> p_exclude)
        and (p_session is null or a.session_key <> p_session))
     and not exists (
      select 1 from public.time_off t join public.professionals p on p.id = p_pro
      where t.business_id = p.business_id and (t.professional_id is null or t.professional_id = p_pro)
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, p_end, '[)'));
$$;

drop function if exists public._slots(uuid, uuid[], uuid, date, uuid, boolean);
create function public._slots(
  p_business uuid, p_service_ids uuid[], p_pro uuid, p_date date,
  p_exclude uuid default null, p_ignore_notice boolean default false
) returns table (slot_start timestamptz, slot_pro uuid, slot_left int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_step int; v_notice int;
  v_n int; v_found int; v_dur int; v_cap int; v_special boolean; v_svc uuid; v_group boolean;
  v_sess text; v_taken int;
  r_pro record; r_wh record;
  t timestamptz; t_end timestamptz;
begin
  select timezone, slot_interval_min, min_notice_min into v_tz, v_step, v_notice
    from public.businesses where id = p_business;
  if v_tz is null then return; end if;

  select count(distinct x) into v_n from unnest(p_service_ids) x;
  select count(*), coalesce(sum(duration_min), 0), coalesce(max(capacity), 1),
         coalesce(bool_or(capacity > 1 or unit_label is not null), false), min(id::text)::uuid
    into v_found, v_dur, v_cap, v_special, v_svc
    from public.services where business_id = p_business and is_active and id = any(p_service_ids);
  if v_n = 0 or v_found <> v_n then return; end if;
  -- Las clases con cupo y los productos por unidad se reservan solos
  if v_special and v_n > 1 then return; end if;
  v_group := v_cap > 1;
  -- Las clases arrancan una detrás de otra (cada "duración"), no cada 15 minutos
  if v_group then v_step := greatest(v_dur, v_step); end if;

  for r_pro in
    select p.id from public.professionals p
    where p.business_id = p_business and p.is_active and (p_pro is null or p.id = p_pro)
      and (select count(*) from public.professional_services ps
           where ps.professional_id = p.id and ps.service_id = any(p_service_ids)) = v_n
    order by p.sort_order, p.name
  loop
    for r_wh in
      select start_time, end_time from public.working_hours
      where professional_id = r_pro.id and weekday = extract(dow from p_date)::int
      order by start_time
    loop
      t := (p_date + r_wh.start_time) at time zone v_tz;
      t_end := (p_date + r_wh.end_time) at time zone v_tz;
      while t + make_interval(mins => v_dur) <= t_end loop
        if p_ignore_notice or t >= now() + make_interval(mins => v_notice) then
          if v_group then
            v_sess := v_svc::text || '@' || extract(epoch from t)::bigint::text;
            select count(*) into v_taken from public.appointments a
             where a.professional_id = r_pro.id and a.session_key = v_sess and a.status <> 'cancelled'
               and (p_exclude is null or a.id <> p_exclude);
            if v_taken < v_cap and public._pro_is_free(r_pro.id, t, t + make_interval(mins => v_dur), p_exclude, v_sess) then
              slot_start := t; slot_pro := r_pro.id; slot_left := v_cap - v_taken;
              return next;
            end if;
          elsif public._pro_is_free(r_pro.id, t, t + make_interval(mins => v_dur), p_exclude) then
            slot_start := t; slot_pro := r_pro.id; slot_left := null;
            return next;
          end if;
        end if;
        t := t + make_interval(mins => v_step);
      end loop;
    end loop;
  end loop;
end $$;

-- ---------- API pública ----------
create or replace function public.get_booking_catalog(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category, 'description', b.description,
      'logo_url', b.logo_url, 'cover_url', b.cover_url, 'template', b.template, 'gallery', b.gallery,
      'primary_color', b.primary_color, 'secondary_color', b.secondary_color, 'background_color', b.background_color,
      'socials', b.socials, 'phone', b.phone, 'whatsapp', b.whatsapp, 'address', b.address, 'city', b.city,
      'timezone', b.timezone, 'is_published', b.is_published, 'max_days_ahead', b.max_days_ahead,
      'cancel_limit_hours', b.cancel_limit_hours,
      'accepting', b.booking_enabled and public.business_usable(b.id)),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
                       'duration_min', s.duration_min, 'price_ars', s.price_ars,
                       'capacity', s.capacity, 'unit_label', s.unit_label, 'max_qty', s.max_qty) order by s.sort_order, s.name)
      from public.services s where s.business_id = b.id and s.is_active
        and exists (select 1 from public.professional_services ps join public.professionals p on p.id = ps.professional_id
                    where ps.service_id = s.id and p.is_active)), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty, 'photo_url', p.photo_url,
                       'service_ids', (select coalesce(jsonb_agg(ps.service_id), '[]'::jsonb) from public.professional_services ps where ps.professional_id = p.id))
                       order by p.sort_order, p.name)
      from public.professionals p where p.business_id = b.id and p.is_active), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = lower(p_slug) and b.status = 'active'
    and (b.is_published or public.has_business_role(b.id, array['owner','admin','professional']) or public.is_platform_admin());
$$;

create or replace function public.get_available_slots(p_slug text, p_service_ids uuid[], p_professional_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_b public.businesses; v_today date;
begin
  v_b := public._public_business(p_slug);
  if v_b.id is null or not v_b.booking_enabled or not public.business_usable(v_b.id) then return '[]'::jsonb; end if;
  v_today := (now() at time zone v_b.timezone)::date;
  if p_date < v_today or p_date > v_today + v_b.max_days_ahead then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('t', x.slot_start, 'p', x.slot_pro, 'l', x.slot_left) order by x.slot_start)
    from (select distinct on (s.slot_start) s.slot_start, s.slot_pro, s.slot_left
          from public._slots(v_b.id, p_service_ids, p_professional_id, p_date) s
          order by s.slot_start, s.slot_left desc nulls last) x), '[]'::jsonb);
end $$;

create or replace function public._booking_json(p_appt uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', a.manage_token, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
    'total_price', a.total_price, 'client_name', c.name,
    'professional', jsonb_build_object('id', p.id, 'name', p.name),
    'services', (select jsonb_agg(jsonb_build_object('id', x.service_id, 'name', x.name, 'duration_min', x.duration_min,
                   'price_ars', x.price_ars, 'quantity', x.quantity, 'unit_label', x.unit_label) order by x.position)
                 from public.appointment_services x where x.appointment_id = a.id),
    'can_change', a.status = 'confirmed' and a.starts_at - make_interval(hours => b.cancel_limit_hours) > now(),
    'business', jsonb_build_object('name', b.name, 'slug', b.slug, 'category', b.category, 'whatsapp', b.whatsapp, 'address', b.address, 'city', b.city,
      'timezone', b.timezone, 'logo_url', b.logo_url, 'primary_color', b.primary_color, 'secondary_color', b.secondary_color,
      'background_color', b.background_color, 'cancel_limit_hours', b.cancel_limit_hours, 'max_days_ahead', b.max_days_ahead)
  )
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  join public.professionals p on p.id = a.professional_id
  join public.clients c on c.id = a.client_id
  where a.id = p_appt;
$$;

-- Cantidad pedida validada en el servidor (nunca se confía en el precio del navegador)
create or replace function public._check_qty(p_business uuid, p_service_ids uuid[], p_quantity int)
returns int language plpgsql stable security definer set search_path = '' as $$
declare v_unit text; v_max int; v_q int := coalesce(p_quantity, 1);
begin
  if cardinality(p_service_ids) <> 1 then
    if v_q <> 1 then raise exception 'La cantidad solo aplica a productos por unidad' using errcode = '22023'; end if;
    return 1;
  end if;
  select unit_label, max_qty into v_unit, v_max from public.services where business_id = p_business and id = p_service_ids[1];
  if v_unit is null then
    if v_q <> 1 then raise exception 'La cantidad solo aplica a productos por unidad' using errcode = '22023'; end if;
    return 1;
  end if;
  if v_q < 1 or v_q > v_max then raise exception 'La cantidad tiene que ser entre 1 y %', v_max using errcode = '22023'; end if;
  return v_q;
end $$;

drop function if exists public.create_booking(text, uuid[], uuid, timestamptz, text, text, text);
create function public.create_booking(
  p_slug text, p_service_ids uuid[], p_professional_id uuid, p_starts_at timestamptz,
  p_name text, p_phone text, p_email text default null, p_quantity int default 1
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b public.businesses; v_pro uuid; v_dur int; v_total numeric; v_norm text; v_qty int; v_group uuid;
  v_client uuid; v_appt uuid; v_active int; v_name text := trim(coalesce(p_name, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  v_b := public._public_business(p_slug);
  if v_b.id is null then raise exception 'Negocio no encontrado' using errcode = '22023'; end if;
  if not v_b.booking_enabled or not public.business_usable(v_b.id) then
    raise exception 'Este negocio no está tomando reservas online en este momento' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Ingresá tu nombre' using errcode = '22023'; end if;
  v_norm := public.normalize_phone(p_phone);
  if v_norm is null then raise exception 'Ingresá un número de WhatsApp válido' using errcode = '22023'; end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El email no es válido' using errcode = '22023'; end if;
  if p_starts_at > now() + make_interval(days => v_b.max_days_ahead + 1) then raise exception 'Fecha fuera de rango' using errcode = '22023'; end if;
  v_qty := public._check_qty(v_b.id, p_service_ids, p_quantity);

  -- Una reserva a la vez por negocio: evita sobrevender el último cupo
  perform pg_advisory_xact_lock(hashtextextended(v_b.id::text, 0));

  select s.slot_pro into v_pro
    from public._slots(v_b.id, p_service_ids, p_professional_id, (p_starts_at at time zone v_b.timezone)::date) s
   where s.slot_start = p_starts_at limit 1;
  if v_pro is null then raise exception 'Ese horario ya no está disponible. Elegí otro.' using errcode = '23P01'; end if;

  select coalesce(sum(duration_min), 0), coalesce(sum(price_ars), 0) * v_qty,
         (array_agg(id) filter (where capacity > 1))[1]
    into v_dur, v_total, v_group
    from public.services where business_id = v_b.id and id = any(p_service_ids);

  select count(*) into v_active from public.appointments a join public.clients c on c.id = a.client_id
   where a.business_id = v_b.id and c.phone_norm = v_norm and a.status = 'confirmed' and a.starts_at > now();
  if v_active >= 3 then raise exception 'Ya tenés 3 reservas activas. Cancelá una para sacar otra.' using errcode = '22023'; end if;
  if v_group is not null and exists (
       select 1 from public.appointments a join public.clients c on c.id = a.client_id
        where a.business_id = v_b.id and c.phone_norm = v_norm and a.status = 'confirmed'
          and a.group_service_id = v_group and a.starts_at = p_starts_at) then
    raise exception 'Ya tenés un lugar reservado en ese horario.' using errcode = '22023';
  end if;

  insert into public.clients as cl (business_id, name, phone, email)
  values (v_b.id, v_name, p_phone, v_email)
  on conflict (business_id, phone_norm) where phone_norm is not null
  do update set email = coalesce(cl.email, excluded.email)
  returning id into v_client;

  begin
    insert into public.appointments (business_id, professional_id, client_id, starts_at, ends_at, status, source, total_price, group_service_id)
    values (v_b.id, v_pro, v_client, p_starts_at, p_starts_at + make_interval(mins => v_dur), 'confirmed', 'online', v_total, v_group)
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar. Elegí otro.' using errcode = '23P01';
  end;

  insert into public.appointment_services (appointment_id, service_id, name, duration_min, price_ars, position, quantity, unit_label)
  select v_appt, s.id, s.name, s.duration_min, s.price_ars, array_position(p_service_ids, s.id), v_qty, s.unit_label
    from public.services s where s.business_id = v_b.id and s.id = any(p_service_ids);

  return public._booking_json(v_appt);
end $$;
grant execute on function public.create_booking(text, uuid[], uuid, timestamptz, text, text, text, int) to anon, authenticated;

create or replace function public.reschedule_booking(p_token uuid, p_starts_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_a public.appointments; v_b public.businesses; v_ids uuid[]; v_ok boolean;
begin
  select * into v_a from public.appointments where manage_token = p_token for update;
  if v_a.id is null then raise exception 'Turno no encontrado' using errcode = '22023'; end if;
  select * into v_b from public.businesses where id = v_a.business_id;
  if not (v_a.status = 'confirmed' and v_a.starts_at - make_interval(hours => v_b.cancel_limit_hours) > now()) then
    raise exception 'Este turno ya no se puede cambiar online. Escribile al negocio.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_b.id::text, 0));
  select array_agg(service_id order by position) into v_ids from public.appointment_services where appointment_id = v_a.id and service_id is not null;
  select exists (select 1 from public._slots(v_a.business_id, v_ids, v_a.professional_id, (p_starts_at at time zone v_b.timezone)::date, v_a.id) s
                  where s.slot_start = p_starts_at) into v_ok;
  if not v_ok then raise exception 'Ese horario no está disponible. Elegí otro.' using errcode = '23P01'; end if;
  begin
    update public.appointments set starts_at = p_starts_at, ends_at = p_starts_at + (v_a.ends_at - v_a.starts_at) where id = v_a.id;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar. Elegí otro.' using errcode = '23P01';
  end;
  return public._booking_json(v_a.id);
end $$;

create or replace function public.get_reschedule_slots(p_token uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_a public.appointments; v_b public.businesses; v_ids uuid[]; v_today date;
begin
  select * into v_a from public.appointments where manage_token = p_token;
  if v_a.id is null or v_a.status <> 'confirmed' then return '[]'::jsonb; end if;
  select * into v_b from public.businesses where id = v_a.business_id;
  v_today := (now() at time zone v_b.timezone)::date;
  if p_date < v_today or p_date > v_today + v_b.max_days_ahead then return '[]'::jsonb; end if;
  select array_agg(service_id order by position) into v_ids from public.appointment_services where appointment_id = v_a.id and service_id is not null;
  return coalesce((select jsonb_agg(jsonb_build_object('t', s.slot_start, 'p', s.slot_pro, 'l', s.slot_left) order by s.slot_start)
    from public._slots(v_a.business_id, v_ids, v_a.professional_id, p_date, v_a.id) s), '[]'::jsonb);
end $$;

-- ---------- API del panel ----------
create or replace function public.staff_available_slots(p_business uuid, p_service_ids uuid[], p_professional_id uuid, p_date date, p_exclude uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business, array['owner','admin','professional']) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('t', s.slot_start, 'p', s.slot_pro, 'l', s.slot_left) order by s.slot_start)
    from (select distinct on (x.slot_start) x.slot_start, x.slot_pro, x.slot_left
          from public._slots(p_business, p_service_ids, p_professional_id, p_date, p_exclude, true) x
          order by x.slot_start, x.slot_left desc nulls last) s), '[]'::jsonb);
end $$;

drop function if exists public.staff_create_appointment(uuid, uuid, uuid[], timestamptz, uuid, text, text, text);
create function public.staff_create_appointment(
  p_business uuid, p_professional_id uuid, p_service_ids uuid[], p_starts_at timestamptz,
  p_client_id uuid default null, p_client_name text default null, p_client_phone text default null, p_notes text default null,
  p_quantity int default 1
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_dur int; v_total numeric; v_n int; v_found int; v_client uuid := p_client_id; v_appt uuid;
  v_qty int; v_group uuid; v_cap int; v_special boolean; v_taken int;
begin
  if not (public.has_business_role(p_business, array['owner','admin'])
          or (public.has_business_role(p_business, array['professional']) and public.my_professional_id(p_business) = p_professional_id)) then
    raise exception 'No tenés permiso para cargar turnos de este profesional' using errcode = '42501';
  end if;
  select count(distinct x) into v_n from unnest(p_service_ids) x;
  select count(*), coalesce(sum(duration_min),0), coalesce(sum(price_ars),0), coalesce(max(capacity),1),
         coalesce(bool_or(capacity > 1 or unit_label is not null), false), (array_agg(id) filter (where capacity > 1))[1]
    into v_found, v_dur, v_total, v_cap, v_special, v_group
    from public.services where business_id = p_business and id = any(p_service_ids);
  if v_n = 0 or v_found <> v_n then raise exception 'Elegí al menos un servicio válido' using errcode = '22023'; end if;
  if v_special and v_n > 1 then raise exception 'Las clases con cupo y los productos por unidad se cargan solos, de a uno' using errcode = '22023'; end if;
  v_qty := public._check_qty(p_business, p_service_ids, p_quantity);
  v_total := v_total * v_qty;

  perform pg_advisory_xact_lock(hashtextextended(p_business::text, 0));
  if v_group is not null then
    select count(*) into v_taken from public.appointments
     where professional_id = p_professional_id and status <> 'cancelled'
       and session_key = v_group::text || '@' || extract(epoch from p_starts_at)::bigint::text;
    if v_taken >= v_cap then raise exception 'La clase de ese horario está completa (% de %)', v_taken, v_cap using errcode = '23P01'; end if;
  end if;

  if v_client is null then
    if char_length(trim(coalesce(p_client_name,''))) < 2 then raise exception 'Ingresá el nombre del cliente' using errcode = '22023'; end if;
    if public.normalize_phone(p_client_phone) is not null then
      insert into public.clients as cl (business_id, name, phone) values (p_business, trim(p_client_name), p_client_phone)
      on conflict (business_id, phone_norm) where phone_norm is not null do update set name = cl.name
      returning id into v_client;
    else
      insert into public.clients (business_id, name) values (p_business, trim(p_client_name)) returning id into v_client;
    end if;
  end if;

  begin
    insert into public.appointments (business_id, professional_id, client_id, starts_at, ends_at, status, source, total_price, notes, created_by, group_service_id)
    values (p_business, p_professional_id, v_client, p_starts_at, p_starts_at + make_interval(mins => v_dur), 'confirmed', 'manual', v_total,
            nullif(trim(coalesce(p_notes,'')), ''), auth.uid(), v_group)
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'Ese profesional ya tiene un turno en ese horario' using errcode = '23P01';
  end;

  insert into public.appointment_services (appointment_id, service_id, name, duration_min, price_ars, position, quantity, unit_label)
  select v_appt, s.id, s.name, s.duration_min, s.price_ars, array_position(p_service_ids, s.id), v_qty, s.unit_label
    from public.services s where s.business_id = p_business and s.id = any(p_service_ids);
  return v_appt;
end $$;
grant execute on function public.staff_create_appointment(uuid, uuid, uuid[], timestamptz, uuid, text, text, text, int) to authenticated;
revoke execute on function public.staff_create_appointment(uuid, uuid, uuid[], timestamptz, uuid, text, text, text, int) from public, anon;

-- Descripción del cobro con cantidad ("20 × Empanadas")
create or replace function public.complete_appointment(p_appointment uuid, p_amount numeric, p_method text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_a public.appointments;
begin
  select * into v_a from public.appointments where id = p_appointment for update;
  if v_a.id is null then raise exception 'Turno no encontrado' using errcode = '22023'; end if;
  if not (public.has_business_role(v_a.business_id, array['owner','admin'])
          or public.my_professional_id(v_a.business_id) = v_a.professional_id) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if v_a.status = 'cancelled' then raise exception 'El turno está cancelado' using errcode = '22023'; end if;
  update public.appointments set status = 'completed' where id = v_a.id;
  if coalesce(p_amount, 0) > 0 then
    insert into public.payments (business_id, appointment_id, professional_id, client_id, amount, method, description, created_by)
    values (v_a.business_id, v_a.id, v_a.professional_id, v_a.client_id, p_amount, p_method,
            (select string_agg(case when quantity > 1 then quantity || ' × ' || name else name end, ' + ' order by position)
               from public.appointment_services where appointment_id = v_a.id), auth.uid());
  end if;
end $$;

-- Ocupación del día contando cada clase una vez
create or replace function public.dashboard_stats(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_today date; v_d0 timestamptz; v_d1 timestamptz; v_m0 timestamptz; v_pro uuid; v_all boolean;
  v_avail numeric; v_booked numeric; v_res jsonb;
begin
  if not public.has_business_role(p_business, array['owner','admin','professional']) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  v_all := public.has_business_role(p_business, array['owner','admin']);
  v_pro := case when v_all then null else public.my_professional_id(p_business) end;
  select timezone into v_tz from public.businesses where id = p_business;
  v_today := (now() at time zone v_tz)::date;
  v_d0 := v_today::timestamp at time zone v_tz;
  v_d1 := (v_today + 1)::timestamp at time zone v_tz;
  v_m0 := date_trunc('month', v_today)::timestamp at time zone v_tz;

  select coalesce(sum(extract(epoch from (w.end_time - w.start_time)) / 60), 0) into v_avail
    from public.working_hours w join public.professionals p on p.id = w.professional_id
   where w.business_id = p_business and p.is_active and w.weekday = extract(dow from v_today)::int
     and (v_all or w.professional_id = v_pro);
  -- Una clase con varios anotados ocupa el horario una sola vez
  select coalesce(sum(extract(epoch from (x.ends_at - x.starts_at)) / 60), 0) into v_booked
    from (select distinct on (professional_id, session_key) starts_at, ends_at
            from public.appointments where business_id = p_business and status <> 'cancelled'
             and starts_at >= v_d0 and starts_at < v_d1 and (v_all or professional_id = v_pro)) x;

  select jsonb_build_object(
    'today', (select count(*) from public.appointments where business_id = p_business and status <> 'cancelled' and starts_at >= v_d0 and starts_at < v_d1 and (v_all or professional_id = v_pro)),
    'upcoming', (select count(*) from public.appointments where business_id = p_business and status = 'confirmed' and starts_at >= now() and starts_at < now() + interval '7 days' and (v_all or professional_id = v_pro)),
    'clients', (select count(*) from public.clients where business_id = p_business),
    'income_today', case when v_all then (select coalesce(sum(amount),0) from public.payments where business_id = p_business and paid_at >= v_d0 and paid_at < v_d1) else null end,
    'income_month', case when v_all then (select coalesce(sum(amount),0) from public.payments where business_id = p_business and paid_at >= v_m0) else null end,
    'no_shows_month', (select count(*) from public.appointments where business_id = p_business and status = 'no_show' and starts_at >= v_m0 and (v_all or professional_id = v_pro)),
    'occupancy_today', case when v_avail > 0 then round(least(v_booked / v_avail, 1) * 100) else null end,
    'top_services', coalesce((select jsonb_agg(t) from (
        select x.name, count(*) as qty from public.appointment_services x join public.appointments a on a.id = x.appointment_id
         where a.business_id = p_business and a.status = 'completed' and a.starts_at >= v_m0 and (v_all or a.professional_id = v_pro)
         group by x.name order by count(*) desc limit 5) t), '[]'::jsonb),
    'next', coalesce((select jsonb_agg(t) from (
        select a.id, a.starts_at, c.name as client, p.name as professional,
               (select string_agg(s.name, ' + ' order by s.position) from public.appointment_services s where s.appointment_id = a.id) as services
          from public.appointments a join public.clients c on c.id = a.client_id join public.professionals p on p.id = a.professional_id
         where a.business_id = p_business and a.status = 'confirmed' and a.ends_at >= now() and (v_all or a.professional_id = v_pro)
         order by a.starts_at limit 6) t), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

-- Funciones internas: no se llaman desde el navegador
revoke execute on function public._pro_is_free(uuid, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke execute on function public._slots(uuid, uuid[], uuid, date, uuid, boolean) from public, anon, authenticated;
revoke execute on function public._check_qty(uuid, uuid[], int) from public, anon, authenticated;
revoke execute on function public.appointments_session_key() from public, anon, authenticated;
revoke execute on function public.create_booking(text, uuid[], uuid, timestamptz, text, text, text, int) from public;
