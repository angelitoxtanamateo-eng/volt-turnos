-- Prueba gratis de 15 días para negocios nuevos
update public.platform_settings set value = '15'::jsonb where key = 'trial_days';
