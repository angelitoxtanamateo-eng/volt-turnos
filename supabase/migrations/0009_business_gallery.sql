-- Galería de fotos y validación de que logo/portada vengan del storage propio
alter table public.businesses
  add column gallery jsonb not null default '[]'::jsonb check (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 8),
  add constraint businesses_logo_url_check check (logo_url is null or logo_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-assets/'),
  add constraint businesses_cover_url_check check (cover_url is null or cover_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-assets/');
-- get_booking_catalog ahora devuelve 'gallery' (ver definición aplicada en Supabase)
