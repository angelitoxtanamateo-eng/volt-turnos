-- =====================================================================
-- VOLT Turnos — Etapa 1: autenticación, multiempresa, roles y planes
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Configuración global de la plataforma (solo superadmin)
-- ---------------------------------------------------------------------
create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
create trigger trg_platform_settings_updated before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (key, value) values
  ('trial_days', '14'::jsonb),
  ('trial_plan_code', '"pro"'::jsonb),
  ('max_businesses_per_user', '3'::jsonb);

-- ---------------------------------------------------------------------
-- Perfiles de usuario (1 a 1 con auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 30),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120), ''),
    nullif(left(coalesce(new.raw_user_meta_data->>'phone', ''), 30), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Superadmins de VOLT
-- ---------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Planes
-- ---------------------------------------------------------------------
create table public.plans (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[a-z0-9_]{2,30}$'),
  name               text not null check (char_length(name) between 2 and 60),
  description        text,
  price_ars          numeric(12,2) not null check (price_ars >= 0),
  max_professionals  int check (max_professionals is null or max_professionals > 0), -- null = ilimitado
  features           jsonb not null default '{}'::jsonb,
  sort_order         int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_plans_updated before update on public.plans
  for each row execute function public.set_updated_at();

insert into public.plans (code, name, description, price_ars, max_professionals, features, sort_order) values
 ('starter',  'Starter',  'Para profesionales independientes', 7990,  1,
   '{"custom_page":true,"calendar":true,"services":true,"booking_link":true,"crm":false,"cash":false,"stats":false,"waitlist":false,"advanced_branding":false,"commissions":false,"advanced_reports":false,"branches":false}', 1),
 ('pro',      'Pro',      'Para equipos de hasta 5 profesionales', 14990, 5,
   '{"custom_page":true,"calendar":true,"services":true,"booking_link":true,"crm":true,"cash":true,"stats":true,"waitlist":true,"advanced_branding":true,"commissions":false,"advanced_reports":false,"branches":false}', 2),
 ('business', 'Business', 'Profesionales ilimitados y herramientas premium', 24990, null,
   '{"custom_page":true,"calendar":true,"services":true,"booking_link":true,"crm":true,"cash":true,"stats":true,"waitlist":true,"advanced_branding":true,"commissions":true,"advanced_reports":true,"branches":true}', 3);

-- ---------------------------------------------------------------------
-- Negocios (tenants)
-- ---------------------------------------------------------------------
create table public.businesses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$' and slug not like '%--%'),
  name              text not null check (char_length(name) between 2 and 80),
  category          text not null default 'peluqueria'
                    check (category in ('peluqueria','barberia','unas','estetica','spa','otro')),
  description       text check (char_length(description) <= 600),
  logo_url          text,
  cover_url         text,
  template          text not null default 'unisex'
                    check (template in ('barberia','peluqueria','nails','estetica','unisex')),
  primary_color     text not null default '#8B5CF6' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color   text not null default '#0B0F19' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color  text not null default '#F8FAFC' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  socials           jsonb not null default '{}'::jsonb,
  phone             text check (char_length(phone) <= 30),
  whatsapp          text check (char_length(whatsapp) <= 30),
  address           text check (char_length(address) <= 200),
  city              text check (char_length(city) <= 80),
  timezone          text not null default 'America/Argentina/Cordoba',
  status            text not null default 'active' check (status in ('active','suspended')),
  is_published      boolean not null default false,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_businesses_created_by on public.businesses(created_by);
create trigger trg_businesses_updated before update on public.businesses
  for each row execute function public.set_updated_at();

-- Slugs que no se pueden usar porque chocan con rutas de la app
create table public.reserved_slugs (slug text primary key);
insert into public.reserved_slugs (slug) values
 ('admin'),('superadmin'),('app'),('api'),('auth'),('login'),('ingresar'),('registro'),('registrarse'),
 ('panel'),('dashboard'),('onboarding'),('cuenta'),('configuracion'),('planes'),('precios'),('soporte'),
 ('ayuda'),('www'),('volt'),('voltturnos'),('static'),('assets'),('terminos'),('privacidad'),('invitacion'),
 ('reservar'),('turnos'),('negocios'),('blog'),('contacto'),('crear-negocio'),('recuperar'),('nueva-clave');

-- Miembros del negocio con su rol
create table public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','admin','professional')),
  created_at   timestamptz not null default now(),
  unique (business_id, user_id)
);
create index idx_business_members_user on public.business_members(user_id);
-- Un solo propietario por negocio
create unique index uq_business_single_owner on public.business_members(business_id) where role = 'owner';

-- Invitaciones a empleados / administradores
create table public.business_invitations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         text not null check (role in ('admin','professional')),
  token        uuid not null unique default gen_random_uuid(),
  invited_by   uuid references auth.users(id) on delete set null,
  accepted_at  timestamptz,
  expires_at   timestamptz not null default now() + interval '7 days',
  created_at   timestamptz not null default now()
);
create index idx_invitations_business on public.business_invitations(business_id);
create index idx_invitations_invited_by on public.business_invitations(invited_by);
create unique index uq_invitation_pending on public.business_invitations(business_id, lower(email)) where accepted_at is null;

-- Suscripción de cada negocio (se escribe solo desde servidor / superadmin)
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null unique references public.businesses(id) on delete cascade,
  plan_id               uuid not null references public.plans(id),
  status                text not null default 'trialing'
                        check (status in ('trialing','active','past_due','canceled','expired')),
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  mp_preapproval_id     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_subscriptions_plan on public.subscriptions(plan_id);
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Funciones de autorización (SECURITY DEFINER para evitar recursión RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function public.has_business_role(p_business uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business and user_id = (select auth.uid()) and role = any(p_roles)
  );
$$;

create or replace function public.shares_business_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members a
    join public.business_members b on b.business_id = a.business_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

-- Un negocio no superadmin no puede cambiar su estado (suspensión) ni el creador
create or replace function public.protect_business_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    if new.status is distinct from old.status then
      raise exception 'Solo VOLT puede cambiar el estado del negocio' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'Campo no editable' using errcode = '42501';
    end if;
    if new.slug is distinct from old.slug
       and exists (select 1 from public.reserved_slugs r where r.slug = new.slug) then
      raise exception 'Esa dirección está reservada' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger trg_businesses_protect before update on public.businesses
  for each row execute function public.protect_business_columns();

-- ---------------------------------------------------------------------
-- RPC: crear negocio (atómico: negocio + propietario + prueba)
-- ---------------------------------------------------------------------
create or replace function public.check_slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(p_slug) ~ '^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$'
     and lower(p_slug) not like '%--%'
     and not exists (select 1 from public.reserved_slugs where slug = lower(p_slug))
     and not exists (select 1 from public.businesses where slug = lower(p_slug));
$$;

create or replace function public.create_business(
  p_name text, p_slug text, p_category text default 'peluqueria', p_template text default 'unisex'
) returns public.businesses
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_slug      text := lower(trim(p_slug));
  v_max       int;
  v_owned     int;
  v_days      int;
  v_plan      uuid;
  v_business  public.businesses;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión' using errcode = '42501';
  end if;

  select (value #>> '{}')::int into v_max from public.platform_settings where key = 'max_businesses_per_user';
  select count(*) into v_owned from public.business_members where user_id = v_uid and role = 'owner';
  if not public.is_platform_admin() and v_owned >= coalesce(v_max, 3) then
    raise exception 'Alcanzaste el máximo de negocios por cuenta' using errcode = '22023';
  end if;

  if not public.check_slug_available(v_slug) then
    raise exception 'Esa dirección no está disponible' using errcode = '23505';
  end if;

  insert into public.businesses (slug, name, category, template, created_by)
  values (v_slug, trim(p_name), p_category, p_template, v_uid)
  returning * into v_business;

  insert into public.business_members (business_id, user_id, role)
  values (v_business.id, v_uid, 'owner');

  select (value #>> '{}')::int into v_days from public.platform_settings where key = 'trial_days';
  select id into v_plan from public.plans
   where code = (select value #>> '{}' from public.platform_settings where key = 'trial_plan_code');
  if v_plan is null then
    select id into v_plan from public.plans where is_active order by sort_order limit 1;
  end if;

  insert into public.subscriptions (business_id, plan_id, status, trial_ends_at)
  values (v_business.id, v_plan, 'trialing', now() + make_interval(days => coalesce(v_days, 14)));

  return v_business;
end $$;

-- ---------------------------------------------------------------------
-- RPC: aceptar invitación
-- ---------------------------------------------------------------------
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   public.business_invitations;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_inv from public.business_invitations
   where token = p_token and accepted_at is null and expires_at > now()
   for update;
  if not found then
    raise exception 'La invitación no existe o venció' using errcode = '22023';
  end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'La invitación es para otro email' using errcode = '42501';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_inv.business_id, v_uid, v_inv.role)
  on conflict (business_id, user_id) do nothing;

  update public.business_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.business_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC pública: datos visibles del negocio (para la página de reservas)
-- Solo campos públicos; nunca datos de clientes ni de usuarios.
-- ---------------------------------------------------------------------
create or replace function public.get_public_business(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category,
    'description', b.description, 'logo_url', b.logo_url, 'cover_url', b.cover_url,
    'template', b.template, 'primary_color', b.primary_color,
    'secondary_color', b.secondary_color, 'background_color', b.background_color,
    'socials', b.socials, 'phone', b.phone, 'whatsapp', b.whatsapp,
    'address', b.address, 'city', b.city, 'timezone', b.timezone,
    'is_published', b.is_published
  )
  from public.businesses b
  where b.slug = lower(p_slug)
    and b.status = 'active'
    and (b.is_published or public.has_business_role(b.id, array['owner','admin','professional'])
         or public.is_platform_admin());
$$;

-- Estado de la suscripción del negocio, para restringir funciones por plan
create or replace function public.business_plan(p_business uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan_code', p.code, 'plan_name', p.name, 'price_ars', p.price_ars, 'max_professionals', p.max_professionals,
    'features', p.features, 'status', s.status, 'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end,
    'is_usable', (s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()))
                 or (s.status = 'trialing' and s.trial_ends_at > now())
                 or (s.status = 'past_due')
  )
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.business_id = p_business
    and (public.has_business_role(p_business, array['owner','admin','professional']) or public.is_platform_admin());
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.platform_settings     enable row level security;
alter table public.profiles              enable row level security;
alter table public.platform_admins       enable row level security;
alter table public.plans                 enable row level security;
alter table public.businesses            enable row level security;
alter table public.reserved_slugs        enable row level security;
alter table public.business_members      enable row level security;
alter table public.business_invitations  enable row level security;
alter table public.subscriptions         enable row level security;

-- platform_settings: solo superadmin
create policy settings_admin_all on public.platform_settings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_business_with(id) or (select public.is_platform_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- platform_admins: cada uno ve solo si es admin; altas solo por SQL
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- plans: públicos los activos; superadmin gestiona
create policy plans_public_read on public.plans for select to anon, authenticated
  using (is_active or (select public.is_platform_admin()));
create policy plans_admin_insert on public.plans for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy plans_admin_update on public.plans for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy plans_admin_delete on public.plans for delete to authenticated
  using ((select public.is_platform_admin()));

-- reserved_slugs: solo superadmin
create policy reserved_admin_all on public.reserved_slugs for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- businesses: miembros ven el suyo; owner/admin editan; altas solo vía RPC
create policy businesses_member_read on public.businesses for select to authenticated
  using (public.has_business_role(id, array['owner','admin','professional']) or (select public.is_platform_admin()));
create policy businesses_manager_update on public.businesses for update to authenticated
  using (public.has_business_role(id, array['owner','admin']) or (select public.is_platform_admin()))
  with check (public.has_business_role(id, array['owner','admin']) or (select public.is_platform_admin()));
create policy businesses_admin_delete on public.businesses for delete to authenticated
  using ((select public.is_platform_admin()));

-- business_members: se ven entre compañeros; cambios por owner (no sobre el owner) o superadmin
create policy members_read on public.business_members for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin','professional']) or (select public.is_platform_admin()));
create policy members_update on public.business_members for update to authenticated
  using ((public.has_business_role(business_id, array['owner']) and role <> 'owner') or (select public.is_platform_admin()))
  with check ((public.has_business_role(business_id, array['owner']) and role in ('admin','professional')) or (select public.is_platform_admin()));
create policy members_delete on public.business_members for delete to authenticated
  using ((public.has_business_role(business_id, array['owner','admin']) and role <> 'owner')
         or (user_id = (select auth.uid()) and role <> 'owner')
         or (select public.is_platform_admin()));

-- business_invitations: owner/admin del negocio
create policy invitations_read on public.business_invitations for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']) or (select public.is_platform_admin()));
create policy invitations_insert on public.business_invitations for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin']) and invited_by = (select auth.uid()));
create policy invitations_delete on public.business_invitations for delete to authenticated
  using (public.has_business_role(business_id, array['owner','admin']) or (select public.is_platform_admin()));

-- subscriptions: owner/admin ven; solo superadmin (o servidor con service_role) modifica
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']) or (select public.is_platform_admin()));
create policy subscriptions_admin_update on public.subscriptions for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- ---------------------------------------------------------------------
-- Permisos de ejecución de funciones
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_business(text,text,text,text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.check_slug_available(text) to authenticated;
grant execute on function public.business_plan(uuid) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;
grant execute on function public.shares_business_with(uuid) to authenticated;
grant execute on function public.get_public_business(text) to anon, authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.protect_business_columns() from authenticated;
revoke execute on function public.set_updated_at() from authenticated;
