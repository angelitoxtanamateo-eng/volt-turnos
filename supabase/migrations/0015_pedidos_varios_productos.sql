-- =====================================================================
-- Pedidos por unidad con varios productos (ej: 20 docenas de empanadas
-- + 5 docenas de sándwiches en un mismo pedido).
-- Los pedidos de un mismo horario comparten la franja (hasta "pedidos por horario"),
-- sin importar qué productos lleve cada uno.
-- =====================================================================

-- Clave de grupo: clase -> id del servicio; pedidos por unidad -> id del negocio
create or replace function public._group_info(p_business uuid, p_service_ids uuid[],
  out ok boolean, out dur int, out cap int, out gid uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_n int; v_found int; v_sum int; v_max int; v_units int; v_class int; v_mincap int; v_classcap int; v_svc uuid;
begin
  ok := false;
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
    if v_units <> v_n then return; end if;          -- no se mezclan productos con turnos
    ok := true; dur := v_max; cap := v_mincap; gid := p_business; return;
  end if;
  if v_class > 0 then
    if v_n > 1 then return; end if;                 -- las clases se reservan solas
    ok := true; dur := v_sum; cap := v_classcap; gid := v_svc; return;
  end if;
  ok := true; dur := v_sum; cap := 1; gid := null;
end $$;

-- Cantidades: una por producto, en el mismo orden que p_service_ids
create or replace function public._check_qtys(p_business uuid, p_service_ids uuid[], p_quantities int[])
returns int[] language plpgsql stable security definer set search_path = '' as $$
declare v_unit text; v_max int; v_name text; v_out int[] := '{}'; v_q int;
begin
  for i in 1 .. coalesce(cardinality(p_service_ids), 0) loop
    select unit_label, max_qty, name into v_unit, v_max, v_name from public.services where business_id = p_business and id = p_service_ids[i];
    v_q := coalesce(p_quantities[i], 1);
    if v_unit is null then
      if v_q <> 1 then raise exception 'La cantidad solo aplica a productos por unidad' using errcode = '22023'; end if;
    elsif v_q < 1 or v_q > v_max then
      raise exception '%: la cantidad tiene que ser entre 1 y %', v_name, v_max using errcode = '22023';
    end if;
    v_out := v_out || v_q;
  end loop;
  return v_out;
end $$;

drop function if exists public._check_qty(uuid, uuid[], int);

create or replace function public._slots(
  p_business uuid, p_service_ids uuid[], p_pro uuid, p_date date,
  p_exclude uuid default null, p_ignore_notice boolean default false
) returns table (slot_start timestamptz, slot_pro uuid, slot_left int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_step int; v_notice int; g record; v_n int;
  v_sess text; v_taken int;
  r_pro record; r_wh record;
  t timestamptz; t_end timestamptz;
begin
  select timezone, slot_interval_min, min_notice_min into v_tz, v_step, v_notice
    from public.businesses where id = p_business;
  if v_tz is null then return; end if;
  select * into g from public._group_info(p_business, p_service_ids);
  if not g.ok then return; end if;
  select count(distinct x) into v_n from unnest(p_service_ids) x;
  -- Las clases y los pedidos arrancan cada "duración", no cada 15 minutos
  if g.gid is not null then v_step := greatest(g.dur, v_step); end if;

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
      while t + make_interval(mins => g.dur) <= t_end loop
        if p_ignore_notice or t >= now() + make_interval(mins => v_notice) then
          if g.gid is not null then
            v_sess := g.gid::text || '@' || extract(epoch from t)::bigint::text;
            select count(*) into v_taken from public.appointments a
             where a.professional_id = r_pro.id and a.session_key = v_sess and a.status <> 'cancelled'
               and (p_exclude is null or a.id <> p_exclude);
            if v_taken < g.cap and public._pro_is_free(r_pro.id, t, t + make_interval(mins => g.dur), p_exclude, v_sess) then
              slot_start := t; slot_pro := r_pro.id; slot_left := g.cap - v_taken;
              return next;
            end if;
          elsif public._pro_is_free(r_pro.id, t, t + make_interval(mins => g.dur), p_exclude) then
            slot_start := t; slot_pro := r_pro.id; slot_left := null;
            return next;
          end if;
        end if;
        t := t + make_interval(mins => v_step);
      end loop;
    end loop;
  end loop;
end $$;

drop function if exists public.create_booking(text, uuid[], uuid, timestamptz, text, text, text, int);
create function public.create_booking(
  p_slug text, p_service_ids uuid[], p_professional_id uuid, p_starts_at timestamptz,
  p_name text, p_phone text, p_email text default null, p_quantities int[] default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_b public.businesses; v_pro uuid; g record; v_total numeric; v_norm text; v_qtys int[];
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
  if (select count(distinct x) from unnest(p_service_ids) x) <> cardinality(p_service_ids) then
    raise exception 'Hay productos repetidos' using errcode = '22023';
  end if;
  select * into g from public._group_info(v_b.id, p_service_ids);
  if not g.ok then raise exception 'Esa combinación no se puede reservar junta' using errcode = '22023'; end if;
  v_qtys := public._check_qtys(v_b.id, p_service_ids, p_quantities);

  -- Una reserva a la vez por negocio: evita sobrevender el último lugar
  perform pg_advisory_xact_lock(hashtextextended(v_b.id::text, 0));

  select s.slot_pro into v_pro
    from public._slots(v_b.id, p_service_ids, p_professional_id, (p_starts_at at time zone v_b.timezone)::date) s
   where s.slot_start = p_starts_at limit 1;
  if v_pro is null then raise exception 'Ese horario ya no está disponible. Elegí otro.' using errcode = '23P01'; end if;

  select coalesce(sum(s.price_ars * v_qtys[array_position(p_service_ids, s.id)]), 0) into v_total
    from public.services s where s.business_id = v_b.id and s.id = any(p_service_ids);

  select count(*) into v_active from public.appointments a join public.clients c on c.id = a.client_id
   where a.business_id = v_b.id and c.phone_norm = v_norm and a.status = 'confirmed' and a.starts_at > now();
  if v_active >= 3 then raise exception 'Ya tenés 3 reservas activas. Cancelá una para sacar otra.' using errcode = '22023'; end if;
  if g.gid is not null and g.gid <> v_b.id and exists (
       select 1 from public.appointments a join public.clients c on c.id = a.client_id
        where a.business_id = v_b.id and c.phone_norm = v_norm and a.status = 'confirmed'
          and a.group_service_id = g.gid and a.starts_at = p_starts_at) then
    raise exception 'Ya tenés un lugar reservado en ese horario.' using errcode = '22023';
  end if;

  insert into public.clients as cl (business_id, name, phone, email)
  values (v_b.id, v_name, p_phone, v_email)
  on conflict (business_id, phone_norm) where phone_norm is not null
  do update set email = coalesce(cl.email, excluded.email)
  returning id into v_client;

  begin
    insert into public.appointments (business_id, professional_id, client_id, starts_at, ends_at, status, source, total_price, group_service_id)
    values (v_b.id, v_pro, v_client, p_starts_at, p_starts_at + make_interval(mins => g.dur), 'confirmed', 'online', v_total, g.gid)
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar. Elegí otro.' using errcode = '23P01';
  end;

  insert into public.appointment_services (appointment_id, service_id, name, duration_min, price_ars, position, quantity, unit_label)
  select v_appt, s.id, s.name, s.duration_min, s.price_ars, array_position(p_service_ids, s.id),
         v_qtys[array_position(p_service_ids, s.id)], s.unit_label
    from public.services s where s.business_id = v_b.id and s.id = any(p_service_ids);

  return public._booking_json(v_appt);
end $$;
revoke execute on function public.create_booking(text, uuid[], uuid, timestamptz, text, text, text, int[]) from public;
grant execute on function public.create_booking(text, uuid[], uuid, timestamptz, text, text, text, int[]) to anon, authenticated;

drop function if exists public.staff_create_appointment(uuid, uuid, uuid[], timestamptz, uuid, text, text, text, int);
create function public.staff_create_appointment(
  p_business uuid, p_professional_id uuid, p_service_ids uuid[], p_starts_at timestamptz,
  p_client_id uuid default null, p_client_name text default null, p_client_phone text default null, p_notes text default null,
  p_quantities int[] default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_total numeric; g record; v_client uuid := p_client_id; v_appt uuid; v_qtys int[]; v_taken int;
begin
  if not (public.has_business_role(p_business, array['owner','admin'])
          or (public.has_business_role(p_business, array['professional']) and public.my_professional_id(p_business) = p_professional_id)) then
    raise exception 'No tenés permiso para cargar turnos de este profesional' using errcode = '42501';
  end if;
  if (select count(distinct x) from unnest(p_service_ids) x) <> coalesce(cardinality(p_service_ids), 0) then
    raise exception 'Hay servicios repetidos' using errcode = '22023';
  end if;
  select * into g from public._group_info(p_business, p_service_ids);
  if not g.ok then raise exception 'Elegí servicios válidos (las clases van solas y los productos no se mezclan con turnos)' using errcode = '22023'; end if;
  v_qtys := public._check_qtys(p_business, p_service_ids, p_quantities);
  select coalesce(sum(s.price_ars * v_qtys[array_position(p_service_ids, s.id)]), 0) into v_total
    from public.services s where s.business_id = p_business and s.id = any(p_service_ids);

  perform pg_advisory_xact_lock(hashtextextended(p_business::text, 0));
  if g.gid is not null then
    select count(*) into v_taken from public.appointments
     where professional_id = p_professional_id and status <> 'cancelled'
       and session_key = g.gid::text || '@' || extract(epoch from p_starts_at)::bigint::text;
    if v_taken >= g.cap then raise exception 'Ese horario está completo (% de %)', v_taken, g.cap using errcode = '23P01'; end if;
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
    values (p_business, p_professional_id, v_client, p_starts_at, p_starts_at + make_interval(mins => g.dur), 'confirmed', 'manual', v_total,
            nullif(trim(coalesce(p_notes,'')), ''), auth.uid(), g.gid)
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'Ese profesional ya tiene un turno en ese horario' using errcode = '23P01';
  end;

  insert into public.appointment_services (appointment_id, service_id, name, duration_min, price_ars, position, quantity, unit_label)
  select v_appt, s.id, s.name, s.duration_min, s.price_ars, array_position(p_service_ids, s.id),
         v_qtys[array_position(p_service_ids, s.id)], s.unit_label
    from public.services s where s.business_id = p_business and s.id = any(p_service_ids);
  return v_appt;
end $$;
revoke execute on function public.staff_create_appointment(uuid, uuid, uuid[], timestamptz, uuid, text, text, text, int[]) from public, anon;
grant execute on function public.staff_create_appointment(uuid, uuid, uuid[], timestamptz, uuid, text, text, text, int[]) to authenticated;

revoke execute on function public._group_info(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public._check_qtys(uuid, uuid[], int[]) from public, anon, authenticated;
revoke execute on function public._slots(uuid, uuid[], uuid, date, uuid, boolean) from public, anon, authenticated;
