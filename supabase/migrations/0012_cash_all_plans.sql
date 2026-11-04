-- La caja queda en todos los planes (las comisiones siguen siendo de Business)
update public.plans set features = features || '{"cash": true}'::jsonb where code = 'starter';
