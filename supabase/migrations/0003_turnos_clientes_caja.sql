-- =====================================================================
-- VOLT Turnos — Etapas 3, 4 y 5: servicios, profesionales, horarios,
-- bloqueos, clientes (CRM), turnos con anti-solapamiento, caja.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Reglas de reserva por negocio
-- ---------------------------------------------------------------------
alter table public.businesses
  add column slot_interval_min  int not null default 15 check (slot_interval_min in (5,10,15,20,30,45,60)),
  add column min_notice_min     int not null default 60 check (min_notice_min between 0 and 10080),
  add column max_days_ahead     int not null default 30 check (max_days_ahead between 1 and 180),
  add column cancel_limit_hours int not null default 3  check (cancel_limit_hours between 0 and 168),
  add column booking_enabled    boolean not null default true;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
-- Últimos 10 dígitos (formato AR: característica + número, sin 0/15/54/9)
create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if d like '00%' then d := substr(d, 3); end if;
  if d like '54%' and length(d) > 10 then d := substr(d, 3); end if;
  if d like '9%' and length(d) = 11 then d := substr(d, 2); end if;
  if d like '0%' then d := substr(d, 2); end if;
  if length(d) = 12 and substr(d, 3, 2) = '15' then d := substr(d,1,2) || substr(d,5); end if;
  if length(d) = 13 and substr(d, 4, 2) = '15' then d := substr(d,1,3) || substr(d,6); end if;
  if length(d) = 12 and substr(d, 5, 2) = '15' then d := substr(d,1,4) || substr(d,7); end if;
  if length(d) < 8 or length(d) > 13 then return null; end if;
  return d;
end $$;

-- ---------------------------------------------------------------------
-- Servicios
-- ---------------------------------------------------------------------
create table public.services (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 80),
  description   text check (char_length(description) <= 300),
  duration_min  int not null check (duration_min between 5 and 600),
  price_ars     numeric(12,2) not null default 0 check (price_ars >= 0),
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, id)
);
create index idx_services_business on public.services(business_id);
create trigger trg_services_updated before update on public.services for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Profesionales
-- ---------------------------------------------------------------------
create table public.professionals (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  name            text not null check (char_length(name) between 2 and 80),
  specialty       text check (char_length(specialty) <= 80),
  photo_url       text,
  phone           text check (char_length(phone) <= 30),
  commission_pct  numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, id)
);
create index idx_professionals_business on public.professionals(business_id);
create index idx_professionals_user on public.professionals(user_id);
create unique index uq_professional_user_per_business on public.professionals(business_id, user_id) where user_id is not null;
create trigger trg_professionals_updated before update on public.professionals for each row execute function public.set_updated_at();

create table public.professional_services (
  business_id      uuid not null,
  professional_id  uuid not null,
  service_id       uuid not null,
  primary key (professional_id, service_id),
  foreign key (business_id, professional_id) references public.professionals(business_id, id) on delete cascade,
  foreign key (business_id, service_id) references public.services(business_id, id) on delete cascade
);
create index idx_prof_services_service on public.professional_services(service_id);
create index idx_prof_services_business_prof on public.professional_services(business_id, professional_id);
create index idx_prof_services_business_serv on public.professional_services(business_id, service_id);

-- Horarios laborales: varios rangos por día = descansos (ej. 9-13 y 16-20)
create table public.working_hours (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null,
  professional_id  uuid not null,
  weekday          smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time       time not null,
  end_time         time not null,
  check (end_time > start_time),
  foreign key (business_id, professional_id) references public.professionals(business_id, id) on delete cascade
);
create index idx_working_hours_prof on public.working_hours(professional_id, weekday);
create index idx_working_hours_business_prof on public.working_hours(business_id, professional_id);

-- Bloqueos / días no laborables (professional_id null = todo el negocio)
create table public.time_off (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  professional_id  uuid,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  reason           text check (char_length(reason) <= 120),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (business_id, professional_id) references public.professionals(business_id, id) on delete cascade
);
create index idx_time_off_business on public.time_off(business_id, starts_at);
create index idx_time_off_prof on public.time_off(professional_id);
create index idx_time_off_created_by on public.time_off(created_by);

-- ---------------------------------------------------------------------
-- Clientes (CRM)
-- ---------------------------------------------------------------------
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 80),
  phone        text check (char_length(phone) <= 30),
  phone_norm   text,
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes        text check (char_length(notes) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, id)
);
create unique index uq_clients_phone on public.clients(business_id, phone_norm) where phone_norm is not null;
create index idx_clients_business_name on public.clients(business_id, lower(name));
create trigger trg_clients_updated before update on public.clients for each row execute function public.set_updated_at();

create or replace function public.clients_set_phone_norm()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.phone_norm := public.normalize_phone(new.phone);
  return new;
end $$;
create trigger trg_clients_phone before insert or update of phone on public.clients
  for each row execute function public.clients_set_phone_norm();

-- ---------------------------------------------------------------------
-- Turnos
-- ---------------------------------------------------------------------
create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  professional_id  uuid not null,
  client_id        uuid not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null default 'confirmed' check (status in ('confirmed','completed','cancelled','no_show')),
  source           text not null default 'manual' check (source in ('online','manual')),
  total_price      numeric(12,2) not null default 0 check (total_price >= 0),
  notes            text check (char_length(notes) <= 500),
  manage_token     uuid not null unique default gen_random_uuid(),
  cancelled_at     timestamptz,
  cancelled_by     text check (cancelled_by in ('client','business')),
  completed_at     timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (business_id, id),
  foreign key (business_id, professional_id) references public.professionals(business_id, id),
  foreign key (business_id, client_id) references public.clients(business_id, id),
  -- Imposible tener dos turnos superpuestos del mismo profesional (protege la concurrencia)
  constraint no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled')
);
create index idx_appointments_business_time on public.appointments(business_id, starts_at);
create index idx_appointments_business_prof on public.appointments(business_id, professional_id);
create index idx_appointments_business_client on public.appointments(business_id, client_id);
create index idx_appointments_created_by on public.appointments(created_by);
create trigger trg_appointments_updated before update on public.appointments for each row execute function public.set_updated_at();

create or replace function public.appointments_status_stamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'completed' then new.completed_at := now(); end if;
    if new.status = 'cancelled' then
      new.cancelled_at := now();
      new.cancelled_by := coalesce(new.cancelled_by, 'business');
    end if;
    if old.status = 'cancelled' and new.status <> 'cancelled' then
      new.cancelled_at := null; new.cancelled_by := null;
    end if;
  end if;
  if new.business_id is distinct from old.business_id or new.manage_token is distinct from old.manage_token then
    raise exception 'Campo no editable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_appointments_status before update on public.appointments
  for each row execute function public.appointments_status_stamps();

create table public.appointment_services (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  service_id      uuid references public.services(id) on delete set null,
  name            text not null,
  duration_min    int not null,
  price_ars       numeric(12,2) not null,
  position        int not null default 0
);
create index idx_appt_services_appt on public.appointment_services(appointment_id);
create index idx_appt_services_service on public.appointment_services(service_id);

-- ---------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  appointment_id   uuid,
  professional_id  uuid,
  client_id        uuid,
  amount           numeric(12,2) not null check (amount > 0),
  method           text not null check (method in ('cash','transfer','mercadopago','card','other')),
  commission_pct   numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  description      text check (char_length(description) <= 200),
  paid_at          timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (business_id, appointment_id) references public.appointments(business_id, id) on delete set null (appointment_id),
  foreign key (business_id, professional_id) references public.professionals(business_id, id) on delete set null (professional_id),
  foreign key (business_id, client_id) references public.clients(business_id, id) on delete set null (client_id)
);
create index idx_payments_business_time on public.payments(business_id, paid_at);
create index idx_payments_business_appt on public.payments(business_id, appointment_id);
create index idx_payments_business_prof on public.payments(business_id, professional_id);
create index idx_payments_business_client on public.payments(business_id, client_id);
create index idx_payments_created_by on public.payments(created_by);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  category     text not null default 'otros' check (category in ('productos','alquiler','servicios','sueldos','publicidad','impuestos','otros')),
  description  text check (char_length(description) <= 200),
  spent_at     date not null default current_date,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index idx_expenses_business_date on public.expenses(business_id, spent_at);
create index idx_expenses_created_by on public.expenses(created_by);

-- La comisión se congela al momento del cobro con el % del profesional
create or replace function public.payments_set_commission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.professional_id is not null and tg_op = 'INSERT' then
    select commission_pct into new.commission_pct from public.professionals where id = new.professional_id;
    new.commission_pct := coalesce(new.commission_pct, 0);
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger trg_payments_commission before insert on public.payments
  for each row execute function public.payments_set_commission();

-- ---------------------------------------------------------------------
-- Helpers de autorización
-- ---------------------------------------------------------------------
create or replace function public.my_professional_id(p_business uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.professionals where business_id = p_business and user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.business_usable(p_business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b join public.subscriptions s on s.business_id = b.id
    where b.id = p_business and b.status = 'active'
      and ((s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()))
           or (s.status = 'trialing' and s.trial_ends_at > now())
           or s.status = 'past_due')
  );
$$;

-- Límite de profesionales activos según plan
create or replace function public.professionals_plan_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max int; v_count int;
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    select p.max_professionals into v_max
      from public.subscriptions s join public.plans p on p.id = s.plan_id where s.business_id = new.business_id;
    if v_max is not null then
      select count(*) into v_count from public.professionals where business_id = new.business_id and is_active and id <> new.id;
      if v_count >= v_max then
        raise exception 'Tu plan permite hasta % profesional(es) activos. Mejorá tu plan para sumar más.', v_max using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_professionals_limit before insert or update of is_active on public.professionals
  for each row execute function public.professionals_plan_limit();

-- ---------------------------------------------------------------------
-- Disponibilidad
-- ---------------------------------------------------------------------
create or replace function public._pro_is_free(p_pro uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
      select 1 from public.appointments a
      where a.professional_id = p_pro and a.status <> 'cancelled'
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
        and (p_exclude is null or a.id <> p_exclude))
     and not exists (
      select 1 from public.time_off t join public.professionals p on p.id = p_pro
      where t.business_id = p.business_id and (t.professional_id is null or t.professional_id = p_pro)
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, p_end, '[)'));
$$;

-- Devuelve inicios posibles por profesional para un día local del negocio
create or replace function public._slots(
  p_business uuid, p_service_ids uuid[], p_pro uuid, p_date date,
  p_exclude uuid default null, p_ignore_notice boolean default false
) returns table (slot_start timestamptz, slot_pro uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_step int; v_notice int;
  v_n int; v_found int; v_dur int;
  r_pro record; r_wh record;
  t timestamptz; t_end timestamptz;
begin
  select timezone, slot_interval_min, min_notice_min into v_tz, v_step, v_notice
    from public.businesses where id = p_business;
  if v_tz is null then return; end if;

  select count(distinct x) into v_n from unnest(p_service_ids) x;
  select count(*), coalesce(sum(duration_min), 0) into v_found, v_dur
    from public.services where business_id = p_business and is_active and id = any(p_service_ids);
  if v_n = 0 or v_found <> v_n then return; end if;

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
        if (p_ignore_notice or t >= now() + make_interval(mins => v_notice))
           and public._pro_is_free(r_pro.id, t, t + make_interval(mins => v_dur), p_exclude) then
          slot_start := t; slot_pro := r_pro.id;
          return next;
        end if;
        t := t + make_interval(mins => v_step);
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- API pública del turnero
-- ---------------------------------------------------------------------
create or replace function public.get_booking_catalog(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category, 'description', b.description,
      'logo_url', b.logo_url, 'cover_url', b.cover_url, 'template', b.template,
      'primary_color', b.primary_color, 'secondary_color', b.secondary_color, 'background_color', b.background_color,
      'socials', b.socials, 'phone', b.phone, 'whatsapp', b.whatsapp, 'address', b.address, 'city', b.city,
      'timezone', b.timezone, 'is_published', b.is_published, 'max_days_ahead', b.max_days_ahead,
      'cancel_limit_hours', b.cancel_limit_hours,
      'accepting', b.booking_enabled and public.business_usable(b.id)),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
                       'duration_min', s.duration_min, 'price_ars', s.price_ars) order by s.sort_order, s.name)
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

create or replace function public._public_business(p_slug text)
returns public.businesses language sql stable security definer set search_path = '' as $$
  select b.* from public.businesses b
  where b.slug = lower(p_slug) and b.status = 'active'
    and (b.is_published or public.has_business_role(b.id, array['owner','admin','professional']));
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
    select jsonb_agg(jsonb_build_object('t', x.slot_start, 'p', x.slot_pro) order by x.slot_start)
    from (select distinct on (s.slot_start) s.slot_start, s.slot_pro
          from public._slots(v_b.id, p_service_ids, p_professional_id, p_date) s
          order by s.slot_start) x), '[]'::jsonb);
end $$;

-- Resultado de un turno para el cliente (sin datos de otros clientes)
create or replace function public._booking_json(p_appt uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', a.manage_token, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
    'total_price', a.total_price, 'client_name', c.name,
    'professional', jsonb_build_object('id', p.id, 'name', p.name),
    'services', (select jsonb_agg(jsonb_build_object('id', x.service_id, 'name', x.name, 'duration_min', x.duration_min, 'price_ars', x.price_ars) order by x.position)
                 from public.appointment_services x where x.appointment_id = a.id),
    'can_change', a.status = 'confirmed' and a.starts_at - make_interval(hours => b.cancel_limit_hours) > now(),
    'business', jsonb_build_object('name', b.name, 'slug', b.slug, 'whatsapp', b.whatsapp, 'address', b.address, 'city', b.city,
      'timezone', b.timezone, 'logo_url', b.logo_url, 'primary_color', b.primary_color, 'secondary_color', b.secondary_color,
      'background_color', b.background_color, 'cancel_limit_hours', b.cancel_limit_hours, 'max_days_ahead', b.max_days_ahead)
  )
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  join public.professionals p on p.id = a.professional_id
  join public.clients c on c.id = a.client_id
  where a.id = p_appt;
$$;

create or replace function public.create_booking(
  p_slug text, p_service_ids uuid[], p_professional_id uuid, p_starts_at timestamptz,
  p_name text, p_phone text, p_email text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b public.businesses; v_pro uuid; v_dur int; v_total numeric; v_norm text;
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

  -- El horario tiene que estar realmente disponible (misma lógica que el listado)
  select s.slot_pro into v_pro
    from public._slots(v_b.id, p_service_ids, p_professional_id, (p_starts_at at time zone v_b.timezone)::date) s
   where s.slot_start = p_starts_at limit 1;
  if v_pro is null then raise exception 'Ese horario ya no está disponible. Elegí otro.' using errcode = '23P01'; end if;

  select coalesce(sum(duration_min), 0), coalesce(sum(price_ars), 0) into v_dur, v_total
    from public.services where business_id = v_b.id and id = any(p_service_ids);

  -- Anti-abuso: máximo 3 turnos futuros activos por teléfono en el negocio
  select count(*) into v_active from public.appointments a join public.clients c on c.id = a.client_id
   where a.business_id = v_b.id and c.phone_norm = v_norm and a.status = 'confirmed' and a.starts_at > now();
  if v_active >= 3 then raise exception 'Ya tenés 3 turnos reservados. Cancelá uno para sacar otro.' using errcode = '22023'; end if;

  insert into public.clients as cl (business_id, name, phone, email)
  values (v_b.id, v_name, p_phone, v_email)
  on conflict (business_id, phone_norm) where phone_norm is not null
  do update set email = coalesce(cl.email, excluded.email)
  returning id into v_client;

  begin
    insert into public.appointments (business_id, professional_id, client_id, starts_at, ends_at, status, source, total_price)
    values (v_b.id, v_pro, v_client, p_starts_at, p_starts_at + make_interval(mins => v_dur), 'confirmed', 'online', v_total)
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar. Elegí otro.' using errcode = '23P01';
  end;

  insert into public.appointment_services (appointment_id, service_id, name, duration_min, price_ars, position)
  select v_appt, s.id, s.name, s.duration_min, s.price_ars, array_position(p_service_ids, s.id)
    from public.services s where s.business_id = v_b.id and s.id = any(p_service_ids);

  return public._booking_json(v_appt);
end $$;

create or replace function public.get_booking(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public._booking_json(a.id) from public.appointments a where a.manage_token = p_token;
$$;

create or replace function public.cancel_booking(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ok boolean;
begin
  select a.id, (a.status = 'confirmed' and a.starts_at - make_interval(hours => b.cancel_limit_hours) > now())
    into v_id, v_ok
    from public.appointments a join public.businesses b on b.id = a.business_id where a.manage_token = p_token for update of a;
  if v_id is null then raise exception 'Turno no encontrado' using errcode = '22023'; end if;
  if not v_ok then raise exception 'Este turno ya no se puede cancelar online. Escribile al negocio.' using errcode = '22023'; end if;
  update public.appointments set status = 'cancelled', cancelled_by = 'client' where id = v_id;
  return public._booking_json(v_id);
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
  return coalesce((select jsonb_agg(jsonb_build_object('t', s.slot_start, 'p', s.slot_pro) order by s.slot_start)
    from public._slots(v_a.business_id, v_ids, v_a.professional_id, p_date, v_a.id) s), '[]'::jsonb);
end $$;

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

-- ---------------------------------------------------------------------
-- API del panel
-- ---------------------------------------------------------------------
create or replace function public.staff_available_slots(p_business uuid, p_service_ids uuid[], p_professional_id uuid, p_date date, p_exclude uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_business_role(p_business, array['owner','admin','professional']) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('t', s.slot_start, 'p', s.slot_pro) order by s.slot_start)
    from (select distinct on (x.slot_start) x.slot_start, x.slot_pro
          from public._slots(p_business, p_service_ids, p_professional_id, p_date, p_exclude, true) x order by x.slot_start) s), '[]'::jsonb);
end $$;

create or replace function public.staff_create_appointment(
  p_business uuid, p_professional_id uuid, p_service_ids uuid[], p_starts_at timestamptz,
  p_client_id uuid default null, p_client_name text default null, p_client_phone text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dur int; v_total numeric; v_n int; v_found int; v_client uuid := p_client_id; v_appt uuid;
begin
  if not (public.has_business_role(p_business, array['owner','admin'])
          or (public.has_business_role(p_business, array['professional']) and public.my_professional_id(p_business) = p_professional_id)) then
    raise exception 'No tenés permiso para cargar turnos de este profesional' using errcode = '42501';
  end if;
  select count(distinct x) into v_n from unnest(p_service_ids) x;
  select count(*), coalesce(sum(duration_min),0), coalesce(sum(price_ars),0) into v_found, v_dur, v_total
    from public.services where business_id = p_business and id = any(p_service_ids);
  if v_n = 0 or v_found <> v_n then raise exception 'Elegí al menos un servicio válido' using errcode = '22023'; end if;

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
    insert into public.appointments (business_id, professional_id, client_id, starts_at, ends_at, status, source, total_price, notes, created_by)
    values (p_business, p_professional_id, v_client, p_starts_at, p_starts_at + make_interval(mins => v_dur), 'confirmed', 'manual', v_total,
            nullif(trim(coalesce(p_notes,'')), ''), auth.uid())
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'Ese profesional ya tiene un turno en ese horario' using errcode = '23P01';
  end;

  insert into public.appointment_services (appointment_id, service_id, name, duration_min, price_ars, position)
  select v_appt, s.id, s.name, s.duration_min, s.price_ars, array_position(p_service_ids, s.id)
    from public.services s where s.business_id = p_business and s.id = any(p_service_ids);
  return v_appt;
end $$;

-- Completa el turno y registra el cobro en una sola operación
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
            (select string_agg(name, ' + ' order by position) from public.appointment_services where appointment_id = v_a.id), auth.uid());
  end if;
end $$;

-- Estadísticas del panel (zona horaria del negocio)
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
  select coalesce(sum(extract(epoch from (ends_at - starts_at)) / 60), 0) into v_booked
    from public.appointments where business_id = p_business and status <> 'cancelled'
     and starts_at >= v_d0 and starts_at < v_d1 and (v_all or professional_id = v_pro);

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

-- Clientes con métricas (respeta RLS de quien consulta)
create or replace view public.clients_with_stats with (security_invoker = true) as
select c.*,
  (select count(*) from public.appointments a where a.client_id = c.id and a.status = 'completed') as visits,
  (select count(*) from public.appointments a where a.client_id = c.id and a.status = 'no_show') as no_shows,
  (select max(a.starts_at) from public.appointments a where a.client_id = c.id and a.status = 'completed') as last_visit,
  (select min(a.starts_at) from public.appointments a where a.client_id = c.id and a.status = 'confirmed' and a.starts_at > now()) as next_visit,
  (select coalesce(sum(p.amount), 0) from public.payments p where p.client_id = c.id) as total_spent
from public.clients c;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.services               enable row level security;
alter table public.professionals          enable row level security;
alter table public.professional_services  enable row level security;
alter table public.working_hours          enable row level security;
alter table public.time_off               enable row level security;
alter table public.clients                enable row level security;
alter table public.appointments           enable row level security;
alter table public.appointment_services   enable row level security;
alter table public.payments               enable row level security;
alter table public.expenses               enable row level security;

-- Catálogo: miembros leen, owner/admin gestionan
create policy services_read on public.services for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin','professional']) or (select public.is_platform_admin()));
create policy services_write on public.services for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin'])) with check (public.has_business_role(business_id, array['owner','admin']));

create policy professionals_read on public.professionals for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin','professional']) or (select public.is_platform_admin()));
create policy professionals_write on public.professionals for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin'])) with check (public.has_business_role(business_id, array['owner','admin']));

create policy prof_services_read on public.professional_services for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin','professional']));
create policy prof_services_write on public.professional_services for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin'])) with check (public.has_business_role(business_id, array['owner','admin']));

create policy working_hours_read on public.working_hours for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin','professional']));
create policy working_hours_write on public.working_hours for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin'])) with check (public.has_business_role(business_id, array['owner','admin']));

-- Bloqueos: owner/admin todo; profesional solo los suyos
create policy time_off_read on public.time_off for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin','professional']));
create policy time_off_insert on public.time_off for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin'])
              or (professional_id is not null and professional_id = public.my_professional_id(business_id)));
create policy time_off_update on public.time_off for update to authenticated
  using (public.has_business_role(business_id, array['owner','admin']) or (professional_id is not null and professional_id = public.my_professional_id(business_id)))
  with check (public.has_business_role(business_id, array['owner','admin']) or (professional_id is not null and professional_id = public.my_professional_id(business_id)));
create policy time_off_delete on public.time_off for delete to authenticated
  using (public.has_business_role(business_id, array['owner','admin']) or (professional_id is not null and professional_id = public.my_professional_id(business_id)));

-- Clientes: todo el equipo los ve (para atender); owner/admin editan
create policy clients_read on public.clients for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin','professional']));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin']));
create policy clients_update on public.clients for update to authenticated
  using (public.has_business_role(business_id, array['owner','admin'])) with check (public.has_business_role(business_id, array['owner','admin']));
create policy clients_delete on public.clients for delete to authenticated
  using (public.has_business_role(business_id, array['owner']));

-- Turnos: owner/admin todos; profesional solo su agenda. Altas por RPC.
create policy appointments_read on public.appointments for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin'])
         or professional_id = public.my_professional_id(business_id));
create policy appointments_update on public.appointments for update to authenticated
  using (public.has_business_role(business_id, array['owner','admin']) or professional_id = public.my_professional_id(business_id))
  with check (public.has_business_role(business_id, array['owner','admin']) or professional_id = public.my_professional_id(business_id));

create policy appt_services_read on public.appointment_services for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));

-- Caja: solo owner/admin
create policy payments_read on public.payments for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']));
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin']));
create policy payments_delete on public.payments for delete to authenticated
  using (public.has_business_role(business_id, array['owner','admin']));

create policy expenses_read on public.expenses for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']));
create policy expenses_write on public.expenses for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin'])) with check (public.has_business_role(business_id, array['owner','admin']));

-- ---------------------------------------------------------------------
-- Permisos de funciones
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_business(text,text,text,text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.check_slug_available(text) to authenticated;
grant execute on function public.business_plan(uuid) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;
grant execute on function public.shares_business_with(uuid) to authenticated;
grant execute on function public.my_professional_id(uuid) to authenticated;
grant execute on function public.staff_available_slots(uuid, uuid[], uuid, date, uuid) to authenticated;
grant execute on function public.staff_create_appointment(uuid, uuid, uuid[], timestamptz, uuid, text, text, text) to authenticated;
grant execute on function public.complete_appointment(uuid, numeric, text) to authenticated;
grant execute on function public.dashboard_stats(uuid) to authenticated;
grant execute on function public.normalize_phone(text) to authenticated;
-- Públicas (turnero)
grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_booking_catalog(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, uuid[], uuid, date) to anon, authenticated;
grant execute on function public.create_booking(text, uuid[], uuid, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.get_booking(uuid) to anon, authenticated;
grant execute on function public.cancel_booking(uuid) to anon, authenticated;
grant execute on function public.get_reschedule_slots(uuid, date) to anon, authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz) to anon, authenticated;
-- Internas: nunca desde la API
revoke execute on function public._slots(uuid, uuid[], uuid, date, uuid, boolean) from authenticated;
revoke execute on function public._pro_is_free(uuid, timestamptz, timestamptz, uuid) from authenticated;
revoke execute on function public._public_business(text) from authenticated;
revoke execute on function public._booking_json(uuid) from authenticated;
revoke execute on function public.business_usable(uuid) from authenticated;
revoke execute on function public.clients_set_phone_norm() from authenticated;
revoke execute on function public.appointments_status_stamps() from authenticated;
revoke execute on function public.payments_set_commission() from authenticated;
revoke execute on function public.professionals_plan_limit() from authenticated;
