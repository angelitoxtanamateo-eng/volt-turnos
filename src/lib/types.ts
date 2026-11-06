export type Role = 'owner' | 'admin' | 'professional'

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  professional: 'Profesional',
}

export type Category =
  | 'peluqueria' | 'barberia' | 'unas' | 'estetica' | 'spa'
  | 'gimnasio' | 'entrenador' | 'gastronomia' | 'consultorio' | 'oficios' | 'tecnico' | 'hogar'
  | 'clases' | 'academia' | 'alquiler' | 'veterinaria' | 'otro'
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'peluqueria', label: 'Peluquería' },
  { value: 'barberia', label: 'Barbería' },
  { value: 'unas', label: 'Uñas' },
  { value: 'estetica', label: 'Estética' },
  { value: 'spa', label: 'Spa / Masajes' },
  { value: 'gimnasio', label: 'Gimnasio / Funcional' },
  { value: 'entrenador', label: 'Entrenador personal' },
  { value: 'gastronomia', label: 'Comidas / Catering' },
  { value: 'consultorio', label: 'Consultorio / Profesional' },
  { value: 'veterinaria', label: 'Veterinaria' },
  { value: 'clases', label: 'Clases particulares' },
  { value: 'academia', label: 'Academia / Talleres' },
  { value: 'tecnico', label: 'Servicio técnico / Instalador' },
  { value: 'oficios', label: 'Oficios' },
  { value: 'hogar', label: 'Servicios para el hogar' },
  { value: 'alquiler', label: 'Alquiler de espacios o equipos' },
  { value: 'otro', label: 'Otro' },
]

/** Palabras que cambian según el rubro (turno / clase / pedido) */
export interface Terms {
  noun: string; nounPl: string; pick: string; pickHint: string; confirmed: string; who: string; whenTitle: string; staff: string; staffPl: string
  /** Nombres de las secciones del panel */
  servicesNav: string; servicesSub: string; prosNav: string; prosSub: string
}
const T_TURNO: Terms = {
  noun: 'turno', nounPl: 'turnos', pick: '¿Qué te querés hacer?', pickHint: 'Podés elegir más de uno.',
  confirmed: '¡Turno confirmado!', who: '¿Con quién?', whenTitle: 'Elegí día y horario', staff: 'profesional', staffPl: 'profesionales',
  servicesNav: 'Servicios', servicesSub: 'Lo que tus clientes pueden reservar',
  prosNav: 'Profesionales', prosSub: 'Quién atiende, qué servicios hace y en qué horarios',
}
export function termsFor(c: Category | string | undefined): Terms {
  if (c === 'gimnasio' || c === 'clases' || c === 'entrenador' || c === 'academia') return {
    ...T_TURNO, noun: 'reserva', nounPl: 'reservas', pick: '¿Qué querés reservar?', pickHint: 'Elegí la clase o actividad.',
    confirmed: '¡Lugar reservado!', who: '¿Con quién?', staff: 'profe', staffPl: 'profes',
    servicesNav: 'Clases y servicios', servicesSub: 'Clases con cupos y turnos individuales',
    prosNav: 'Profes', prosSub: 'Quién da cada clase y en qué horarios',
  }
  if (c === 'gastronomia') return {
    ...T_TURNO, noun: 'pedido', nounPl: 'pedidos', pick: '¿Qué querés pedir?', pickHint: 'Elegí el producto y la cantidad.',
    confirmed: '¡Pedido confirmado!', who: '¿Dónde lo retirás?', whenTitle: '¿Para cuándo lo querés?', staff: 'sucursal', staffPl: 'sucursales',
    servicesNav: 'Productos', servicesSub: 'Lo que tus clientes pueden pedir, con precio por unidad',
    prosNav: 'Retiro y horarios', prosSub: 'Dónde se retiran los pedidos y en qué horarios',
  }
  return T_TURNO
}

/** Formas de reservar (módulos). El rubro solo sugiere cuáles vienen activadas. */
export type ServiceKind = 'turno' | 'clase' | 'unidad'
export type ModuleKey = 'turnos' | 'clases' | 'pedidos'
export type Modules = Record<ModuleKey, boolean>
export const MODULE_INFO: { key: ModuleKey; kind: ServiceKind; title: string; text: string }[] = [
  { key: 'turnos', kind: 'turno', title: 'Turnos', text: 'Un cliente por horario: cortes, consultas, visitas, reparaciones.' },
  { key: 'clases', kind: 'clase', title: 'Clases con cupos', text: 'Varias personas en el mismo horario: funcional, yoga, talleres, visitas guiadas.' },
  { key: 'pedidos', kind: 'unidad', title: 'Pedidos por unidad', text: 'El cliente elige productos y cantidades: empanadas, viandas, tortas.' },
]
/** Igual que public.business_modules() en la base */
export function modulesOf(category: Category | string | undefined, saved?: Partial<Modules> | null): Modules {
  const c = category ?? 'otro'
  return {
    turnos: saved?.turnos ?? c !== 'gastronomia',
    clases: saved?.clases ?? ['gimnasio', 'entrenador', 'clases', 'academia', 'otro'].includes(c),
    pedidos: saved?.pedidos ?? ['gastronomia', 'otro'].includes(c),
  }
}
export function kindsFor(m: Modules): ServiceKind[] {
  return MODULE_INFO.filter((x) => m[x.key]).map((x) => x.kind)
}

export type Template = 'barberia' | 'peluqueria' | 'nails' | 'estetica' | 'unisex' | 'gym' | 'food'
export const TEMPLATES: Record<Template, { label: string; primary: string; secondary: string; background: string }> = {
  barberia: { label: 'Barbería Premium', primary: '#C9A227', secondary: '#111111', background: '#1C1C1E' },
  peluqueria: { label: 'Peluquería Elegante', primary: '#E8A0B4', secondary: '#B89B7A', background: '#FFFFFF' },
  nails: { label: 'Nails Studio', primary: '#B39DDB', secondary: '#F8BBD0', background: '#FFFFFF' },
  estetica: { label: 'Centro de Estética', primary: '#6FBF8E', secondary: '#E8F5E9', background: '#FFFFFF' },
  unisex: { label: 'Unisex Moderno', primary: '#8B5CF6', secondary: '#0F172A', background: '#FFFFFF' },
  gym: { label: 'Gimnasio Energía', primary: '#F97316', secondary: '#111827', background: '#0B0B0F' },
  food: { label: 'Cocina Casera', primary: '#DC2626', secondary: '#F59E0B', background: '#FFFBF5' },
}
export const CATEGORY_TEMPLATE: Record<Category, Template> = {
  peluqueria: 'peluqueria', barberia: 'barberia', unas: 'nails', estetica: 'estetica', spa: 'estetica',
  gimnasio: 'gym', entrenador: 'gym', gastronomia: 'food', consultorio: 'estetica', veterinaria: 'unisex', oficios: 'unisex',
  tecnico: 'unisex', hogar: 'unisex', clases: 'unisex', academia: 'unisex', alquiler: 'unisex', otro: 'unisex',
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
  slot_interval_min: number
  min_notice_min: number
  max_days_ahead: number
  cancel_limit_hours: number
  booking_enabled: boolean
  gallery: string[]
  modules?: Partial<Modules> | null
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
  cancel_at_period_end?: boolean
  mp_status?: 'pending' | 'authorized' | 'paused' | 'cancelled' | null
  mp_plan_code?: string | null
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
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 50)
}

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_min: number
  price_ars: number
  is_active: boolean
  sort_order: number
  /** Lugares por horario (1 = turno individual, más = clase grupal) */
  capacity: number
  /** Si tiene valor, se vende por unidad ("docena", "unidad", "kg"…) */
  unit_label: string | null
  max_qty: number
}

/** "$ 9.000 / docena" */
export const priceLabel = (s: { price_ars: number; unit_label?: string | null }) =>
  s.unit_label ? `${ars(Number(s.price_ars))} / ${s.unit_label}` : ars(Number(s.price_ars))
/** "20 docenas" */
export function qtyLabel(q: number, unit: string | null | undefined) {
  if (!unit) return String(q)
  if (q === 1) return `1 ${unit}`
  const u = unit.trim()
  let pl = u
  if (/^(kg|g|gr|grs|l|lt|ml|cc|cm|m)\.?$/i.test(u)) pl = u
  else if (/ión$/i.test(u)) pl = u.replace(/ión$/i, 'iones')
  else if (/[aeiouáéó]$/i.test(u)) pl = `${u}s`
  else if (/z$/i.test(u)) pl = `${u.slice(0, -1)}ces`
  else if (/[a-zñ]$/i.test(u)) pl = `${u}es`
  return `${q} ${pl}`
}

export interface Professional {
  id: string
  business_id: string
  user_id: string | null
  name: string
  specialty: string | null
  photo_url: string | null
  phone: string | null
  commission_pct: number
  is_active: boolean
  sort_order: number
}

export interface WorkingHour {
  id?: string
  weekday: number
  start_time: string
  end_time: string
}

export type ApptStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export const APPT_STATUS: Record<ApptStatus, { label: string; cls: string; dot: string }> = {
  confirmed: { label: 'Confirmado', cls: 'bg-volt-violet/15 text-volt-violet2', dot: 'bg-volt-violet' },
  completed: { label: 'Completado', cls: 'bg-volt-green/15 text-volt-green', dot: 'bg-volt-green' },
  cancelled: { label: 'Cancelado', cls: 'bg-white/5 text-volt-muted line-through', dot: 'bg-volt-muted' },
  no_show: { label: 'Ausente', cls: 'bg-volt-amber/15 text-volt-amber', dot: 'bg-volt-amber' },
}

export interface Appointment {
  id: string
  business_id: string
  professional_id: string
  client_id: string
  starts_at: string
  ends_at: string
  status: ApptStatus
  source: 'online' | 'manual'
  total_price: number
  notes: string | null
  manage_token: string
  cancelled_by: 'client' | 'business' | null
  group_service_id: string | null
  session_key: string
  clients: { id: string; name: string; phone: string | null } | null
  appointment_services: { service_id: string | null; name: string; duration_min: number; price_ars: number; position: number; quantity?: number; unit_label?: string | null }[]
}

export interface TimeOff {
  id: string
  professional_id: string | null
  starts_at: string
  ends_at: string
  reason: string | null
}

export interface ClientRow {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
  visits: number
  no_shows: number
  last_visit: string | null
  next_visit: string | null
  total_spent: number
}

export type PayMethod = 'cash' | 'transfer' | 'mercadopago' | 'card' | 'other'
export const PAY_METHODS: Record<PayMethod, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', mercadopago: 'Mercado Pago', card: 'Tarjeta', other: 'Otro',
}

export const EXPENSE_CATEGORIES: Record<string, string> = {
  productos: 'Productos', alquiler: 'Alquiler', servicios: 'Luz, agua, internet', sueldos: 'Sueldos',
  publicidad: 'Publicidad', impuestos: 'Impuestos', otros: 'Otros',
}

export const servicesLabel = (a: { appointment_services: { name: string; position: number; quantity?: number; unit_label?: string | null }[] }) =>
  [...(a.appointment_services ?? [])].sort((x, y) => x.position - y.position)
    .map((s) => ((s.quantity ?? 1) > 1 || s.unit_label ? `${qtyLabel(s.quantity ?? 1, s.unit_label)} · ${s.name}` : s.name)).join(' + ')
