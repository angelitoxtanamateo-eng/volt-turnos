-- Cobro de suscripciones con link de Mercado Pago + aprobación manual del superadmin VOLT
insert into public.platform_settings (key, value)
values ('mp_payment_link', '"https://link.mercadopago.com.ar/voltsd"'::jsonb)
on conflict (key) do update set value = excluded.value;

create table public.subscription_payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  plan_id       uuid not null references public.plans(id),
  months        int not null default 1 check (months between 1 and 12),
  amount        numeric(12,2) not null default 0,
  method        text not null default 'mp_link' check (method in ('mp_link','transfer','cash','other')),
  reference     text not null check (char_length(trim(reference)) between 3 and 60),
  payer_note    text check (char_length(payer_note) <= 300),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note    text check (char_length(admin_note) <= 300),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  period_end    timestamptz
);
create index idx_sub_payments_business on public.subscription_payments(business_id, created_at desc);
create index idx_sub_payments_status on public.subscription_payments(status) where status = 'pending';
create index idx_sub_payments_plan on public.subscription_payments(plan_id);
create index idx_sub_payments_created_by on public.subscription_payments(created_by);
create index idx_sub_payments_reviewed_by on public.subscription_payments(reviewed_by);
create unique index uq_sub_payments_reference on public.subscription_payments(lower(trim(reference))) where status <> 'rejected';

-- El negocio no decide monto ni estado; un solo pago pendiente por negocio
create or replace function public.subscription_payments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    new.status := 'pending';
    new.admin_note := null; new.reviewed_by := null; new.reviewed_at := null; new.period_end := null;
    new.created_by := auth.uid();
    if exists (select 1 from public.subscription_payments p where p.business_id = new.business_id and p.status = 'pending') then
      raise exception 'Ya tenés un pago esperando aprobación' using errcode = '22023';
    end if;
  end if;
  select price_ars * new.months into new.amount from public.plans where id = new.plan_id and is_active;
  if new.amount is null then raise exception 'Plan no disponible' using errcode = '22023'; end if;
  new.reference := trim(new.reference);
  return new;
end $$;
create trigger trg_sub_payments_guard before insert on public.subscription_payments
  for each row execute function public.subscription_payments_guard();

alter table public.subscription_payments enable row level security;
create policy sub_payments_read on public.subscription_payments for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']) or (select public.is_platform_admin()));
create policy sub_payments_insert on public.subscription_payments for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin']));

create or replace function public.get_payment_link()
returns text language sql stable security definer set search_path = '' as $$
  select value #>> '{}' from public.platform_settings where key = 'mp_payment_link';
$$;

create or replace function public.review_subscription_payment(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.subscription_payments; v_s public.subscriptions; v_start timestamptz; v_end timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Solo VOLT puede aprobar pagos' using errcode = '42501'; end if;
  select * into v_p from public.subscription_payments where id = p_id for update;
  if v_p.id is null then raise exception 'Pago no encontrado' using errcode = '22023'; end if;
  if v_p.status <> 'pending' then raise exception 'Este pago ya fue revisado' using errcode = '22023'; end if;
  if not p_approve then
    update public.subscription_payments set status = 'rejected', admin_note = nullif(trim(coalesce(p_note,'')), ''),
      reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
    return;
  end if;
  select * into v_s from public.subscriptions where business_id = v_p.business_id for update;
  v_start := case when v_s.status = 'active' and v_s.current_period_end > now() and v_s.plan_id = v_p.plan_id
                  then v_s.current_period_end else now() end;
  v_end := v_start + make_interval(months => v_p.months);
  update public.subscriptions set plan_id = v_p.plan_id, status = 'active', current_period_start = v_start,
    current_period_end = v_end, cancel_at_period_end = false where business_id = v_p.business_id;
  update public.subscription_payments set status = 'approved', admin_note = nullif(trim(coalesce(p_note,'')), ''),
    reviewed_by = auth.uid(), reviewed_at = now(), period_end = v_end where id = p_id;
end $$;

revoke execute on function public.subscription_payments_guard() from public, anon, authenticated;
revoke execute on function public.get_payment_link() from public, anon;
revoke execute on function public.review_subscription_payment(uuid, boolean, text) from public, anon;
grant execute on function public.get_payment_link() to authenticated;
grant execute on function public.review_subscription_payment(uuid, boolean, text) to authenticated;
