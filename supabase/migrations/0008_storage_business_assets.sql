-- Logos, portadas y fotos de cada negocio (lectura pública; escritura solo owner/admin en su carpeta)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-assets', 'business-assets', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_business_folder(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    where m.user_id = (select auth.uid()) and m.role in ('owner','admin')
      and m.business_id::text = split_part(p_name, '/', 1)
  );
$$;
revoke execute on function public.can_manage_business_folder(text) from public, anon;
grant execute on function public.can_manage_business_folder(text) to authenticated;

create policy business_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'business-assets' and public.can_manage_business_folder(name));
create policy business_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'business-assets' and public.can_manage_business_folder(name))
  with check (bucket_id = 'business-assets' and public.can_manage_business_folder(name));
create policy business_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-assets' and public.can_manage_business_folder(name));
