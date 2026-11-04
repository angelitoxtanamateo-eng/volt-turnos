export type Role = 'owner' | 'admin' | 'professional'

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  professional: 'Profesional',
}

export type Category = 'peluqueria' | 'barberia' | 'unas' | 'estetica' | 'spa' | 'otro'
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'peluqueria', label: 'Peluquería' },
  { value: 'barberia', label: 'Barbería' },
  { value: 'unas', label: 'Uñas' },
  { value: 'estetica', label: 'Estética' },
  { value: 'spa', label: 'Spa / Masajes' },
  { value: 'otro', label: 'Otro' },
]

export type Template = 'barberia' | 'peluqueria' | 'nails' | 'estetica' | 'unisex'
export const TEMPLATES: Record<Template, { label: string; primary: string; secondary: string; background: string }> = {
  barberia: { label: 'Barbería Premium', primary: '#C9A227', secondary: '#111111', background: '#1C1C1E' },
  peluqueria: { label: 'Peluquería Elegante', primary: '#E8A0B4', secondary: '#B89B7A', background: '#FFFFFF' },
  nails: { label: 'Nails Studio', primary: '#B39DDB', secondary: '#F8BBD0', background: '#FFFFFF' },
  estetica: { label: 'Centro de Estética', primary: '#6FBF8E', secondary: '#E8F5E9', background: '#FFFFFF' },
  unisex: { label: 'Unisex Moderno', primary: '#8B5CF6', secondary: '#0F172A', background: '#FFFFFF' },
}
export const CATEGORY_TEMPLATE: Record<Category, Template> = {
  peluqueria: 'peluqueria', barberia: 'barberia', unas: 'nails', estetica: 'estetica', spa: 'estetica', otro: 'unisex',
}

export interface Business {
  id: string
  slug: string
  name: string
  category: Category
  description: string | null
  logo_url: string | null
  cover_url: string | null
  template: Template
  primary_color: string
  secondary_color: string
  background_color: string
  socials: Record<string, string>
  phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  timezone: string
  status: 'active' | 'suspended'
  is_published: boolean
  created_by: string | null
  created_at: string
}

export interface Membership {
  id: string
  role: Role
  business: Business
}

export interface PlanInfo {
  plan_code: string
  plan_name: string
  price_ars: number
  max_professionals: number | null
  features: Record<string, boolean>
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  trial_ends_at: string | null
  current_period_end: string | null
  is_usable: boolean
}

export interface Plan {
  id: string
  code: string
  name: string
  description: string | null
  price_ars: number
  max_professionals: number | null
  features: Record<string, boolean>
  sort_order: number
  is_active: boolean
}

export const SUB_STATUS: Record<PlanInfo['status'], { label: string; cls: string }> = {
  trialing: { label: 'Prueba gratis', cls: 'bg-volt-violet/15 text-volt-violet2' },
  active: { label: 'Activa', cls: 'bg-volt-green/15 text-volt-green' },
  past_due: { label: 'Pago pendiente', cls: 'bg-volt-amber/15 text-volt-amber' },
  canceled: { label: 'Cancelada', cls: 'bg-volt-red/15 text-volt-red' },
  expired: { label: 'Vencida', cls: 'bg-volt-red/15 text-volt-red' },
}

export const ars = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** "Wachas Estilistas" -> "wachas-estilistas" */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 50)
}
