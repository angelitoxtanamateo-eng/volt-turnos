import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Traduce errores de Supabase/Postgres a mensajes claros en español */
export function errorMessage(err: unknown): string {
  const e = err as { message?: string; code?: string } | null
  const msg = e?.message ?? 'Ocurrió un error inesperado'
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos'
  if (msg.includes('Email not confirmed')) return 'Tenés que confirmar tu email antes de ingresar (revisá tu casilla)'
  if (msg.includes('User already registered')) return 'Ya existe una cuenta con ese email'
  if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 8 caracteres'
  if (msg.toLowerCase().includes('rate limit')) return 'Demasiados intentos. Esperá un momento y probá de nuevo'
  if (e?.code === '23505') return msg.includes('slug') ? 'Esa dirección ya está en uso' : msg
  if (e?.code === '42501' && !/[áéíóú]/.test(msg)) return 'No tenés permiso para hacer esto'
  if (msg.includes('Failed to fetch')) return 'Sin conexión. Revisá tu internet'
  return msg
}
