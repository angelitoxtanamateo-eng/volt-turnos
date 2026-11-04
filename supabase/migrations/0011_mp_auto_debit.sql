-- Débito automático mensual con Mercado Pago (preapproval). Lo escribe solo el webhook (service_role).
alter table public.subscriptions
  add column mp_status text check (mp_status in ('pending','authorized','paused','cancelled')),
  add column mp_payer_email text,
  add column mp_plan_id uuid references public.plans(id);
create index idx_subscriptions_mp_plan on public.subscriptions(mp_plan_id);
create unique index uq_subscriptions_mp_preapproval on public.subscriptions(mp_preapproval_id) where mp_preapproval_id is not null;

alter table public.subscription_payments drop constraint subscription_payments_method_check;
alter table public.subscription_payments add constraint subscription_payments_method_check
  check (method in ('mp_link','mp_auto','transfer','cash','other'));

create or replace function public.subscription_payments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
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

create or replace function public.mp_apply_payment(p_business uuid, p_plan uuid, p_payment_id text, p_amount numeric)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_s public.subscriptions; v_start timestamptz; v_end timestamptz; v_ref text := 'mp:' || p_payment_id;
begin
  if exists (select 1 from public.subscription_payments where reference = v_ref) then return false; end if;
  select * into v_s from public.subscriptions where business_id = p_business for update;
  if v_s.id is null then return false; end if;
  v_start := greatest(now(), coalesce(case when v_s.status = 'active' then v_s.current_period_end end, now()));
  v_end := v_start + interval '1 month';
  insert into public.subscription_payments (business_id, plan_id, months, amount, method, reference, status, reviewed_at, period_end)
  values (p_business, p_plan, 1, p_amount, 'mp_auto', v_ref, 'approved', now(), v_end);
  update public.subscriptions set plan_id = p_plan, status = 'active', current_period_start = v_start, current_period_end = v_end,
    cancel_at_period_end = false where business_id = p_business;
  return true;
end $$;
revoke execute on function public.mp_apply_payment(uuid, uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.subscription_payments_guard() from public, anon, authenticated;
-- business_plan(): ahora devuelve también mp_status, mp_plan_code y cancel_at_period_end (ver definición aplicada)
