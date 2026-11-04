-- Agenda en vivo: el panel se actualiza cuando entra una reserva online (respeta RLS)
alter publication supabase_realtime add table public.appointments;
