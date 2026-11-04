-- Creada por la opción 'automatic RLS' de Supabase; no debe ser llamable desde la API
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
