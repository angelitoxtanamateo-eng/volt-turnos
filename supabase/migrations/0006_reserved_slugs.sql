-- Rutas de la app que no pueden ser dirección de un negocio
insert into public.reserved_slugs (slug) values ('turno'), ('caja'), ('agenda'), ('clientes') on conflict do nothing;
