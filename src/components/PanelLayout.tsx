import { useState, type ReactNode } from 'react'
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Users, Store, CreditCard, ShieldCheck, LogOut, Menu, X, ExternalLink, Plus, ChevronDown, Scissors, Contact, Wallet, UserRound, Palette,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { Logo } from './ui'
import BookingToasts from './BookingToasts'
import { ROLE_LABEL, SUB_STATUS, fmtDate } from '../lib/types'

type NavItem = { to: string; label: string; icon: ReactNode; soon?: boolean; manage?: boolean }

const NAV: NavItem[] = [
  { to: '/panel', label: 'Inicio', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { to: '/panel/agenda', label: 'Agenda', icon: <CalendarDays className="h-[18px] w-[18px]" /> },
  { to: '/panel/clientes', label: 'Clientes', icon: <Contact className="h-[18px] w-[18px]" /> },
  { to: '/panel/caja', label: 'Caja', icon: <Wallet className="h-[18px] w-[18px]" />, manage: true },
  { to: '/panel/servicios', label: 'Servicios', icon: <Scissors className="h-[18px] w-[18px]" />, manage: true },
  { to: '/panel/profesionales', label: 'Profesionales', icon: <UserRound className="h-[18px] w-[18px]" />, manage: true },
  { to: '/panel/equipo', label: 'Equipo y accesos', icon: <Users className="h-[18px] w-[18px]" /> },
  { to: '/panel/diseno', label: 'Diseño de mi página', icon: <Palette className="h-[18px] w-[18px]" />, manage: true },
  { to: '/panel/negocio', label: 'Mi negocio', icon: <Store className="h-[18px] w-[18px]" />, manage: true },
  { to: '/panel/plan', label: 'Plan', icon: <CreditCard className="h-[18px] w-[18px]" />, manage: true },
]

export default function PanelLayout() {
  const { profile, user, isPlatformAdmin, memberships, signOut } = useAuth()
  const { current, setCurrent, plan, can } = useBusiness()
  const [open, setOpen] = useState(false)
  const [switcher, setSwitcher] = useState(false)
  const navigate = useNavigate()
  if (!current) return null
  const b = current.business

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-4"><Logo to="/panel" /></div>

      {/* Selector de negocio */}
      <div className="relative px-3">
        <button
          onClick={() => setSwitcher((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl border border-volt-line bg-volt-bg/60 px-3 py-2.5 text-left hover:border-volt-violet/50 transition"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg font-bold text-white" style={{ background: b.primary_color }}>
            {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full object-cover" /> : b.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{b.name}</span>
            <span className="block text-xs text-volt-muted">{ROLE_LABEL[current.role]}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-volt-muted" />
        </button>
        {switcher && (
          <div className="absolute left-3 right-3 z-30 mt-2 rounded-xl border border-volt-line bg-volt-card p-1.5 shadow-2xl animate-fade-up">
            {memberships.map((m) => (
              <button
                key={m.business.id}
                onClick={() => { setCurrent(m.business.id); setSwitcher(false); setOpen(false); navigate('/panel') }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-white/5 ${m.business.id === b.id ? 'text-volt-violet2' : ''}`}
              >
                <span className="truncate">{m.business.name}</span>
                <span className="text-xs text-volt-muted">{ROLE_LABEL[m.role]}</span>
              </button>
            ))}
            <Link to="/crear-negocio" onClick={() => setSwitcher(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-volt-muted hover:bg-white/5 hover:text-volt-white">
              <Plus className="h-4 w-4" /> Crear otro negocio
            </Link>
          </div>
        )}
      </div>

      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.filter((n) => !n.manage || can('manage')).map((n) =>
          n.soon ? (
            <div key={n.to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-volt-muted/50 cursor-not-allowed">
              {n.icon}<span className="flex-1">{n.label}</span>
              <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase">Pronto</span>
            </div>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/panel'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-volt-violet/15 text-volt-white shadow-[inset_3px_0_0_#8B5CF6]' : 'text-volt-muted hover:bg-white/5 hover:text-volt-white'
                }`
              }
            >
              {n.icon}{n.label}
            </NavLink>
          ),
        )}

        <a
          href={`/${b.slug}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-volt-muted hover:bg-white/5 hover:text-volt-white"
        >
          <ExternalLink className="h-[18px] w-[18px]" /> Ver mi página
        </a>

        {isPlatformAdmin && (
          <NavLink
            to="/superadmin"
            onClick={() => setOpen(false)}
            className="mt-3 flex items-center gap-3 rounded-xl border border-volt-violet/30 bg-volt-violet/10 px-3 py-2.5 text-sm font-semibold text-volt-violet2"
          >
            <ShieldCheck className="h-[18px] w-[18px]" /> Panel VOLT
          </NavLink>
        )}
      </nav>

      <div className="border-t border-volt-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-volt-line text-sm font-bold">
            {(profile?.full_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{profile?.full_name ?? 'Mi cuenta'}</span>
            <span className="block truncate text-xs text-volt-muted">{user?.email}</span>
          </span>
          <button onClick={() => signOut()} title="Cerrar sesión" className="rounded-lg p-2 text-volt-muted hover:bg-white/5 hover:text-volt-red">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  const trialDaysLeft = plan?.status === 'trialing' && plan.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(plan.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null

  return (
    <div className="min-h-[100dvh] lg:flex">
      {/* Sidebar escritorio */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 border-r border-volt-line bg-volt-card/40 lg:sticky lg:top-0 lg:h-[100dvh]">
        {sidebar}
      </aside>

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-volt-line bg-volt-bg/85 px-4 py-3 backdrop-blur lg:hidden">
        <Logo size="sm" to="/panel" />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/5" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Drawer móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[84%] max-w-xs border-r border-volt-line bg-volt-card animate-fade-up">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 hover:bg-white/5" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <BookingToasts businessId={b.id} tz={b.timezone} />
      <main className="flex-1 min-w-0">
        {b.status === 'suspended' && (
          <div className="bg-volt-red/15 px-4 py-2.5 text-center text-sm text-red-300">
            Este negocio está suspendido. Escribinos a VOLT para reactivarlo.
          </div>
        )}
        {plan && trialDaysLeft !== null && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-volt-violet/10 px-4 py-2 text-center text-sm text-volt-violet2">
            <span className={`chip ${SUB_STATUS.trialing.cls}`}>Prueba {plan.plan_name}</span>
            Te quedan <b>{trialDaysLeft} días</b> (hasta el {fmtDate(plan.trial_ends_at)})
          </div>
        )}
        {plan && plan.is_usable && plan.status === 'active' && plan.current_period_end && (new Date(plan.current_period_end).getTime() - Date.now()) < 5 * 86400000 && (
          <div className="bg-volt-amber/10 px-4 py-2 text-center text-sm text-amber-300">
            Tu plan vence el {fmtDate(plan.current_period_end)}. {can('manage') && <Link to="/panel/plan" className="font-semibold underline">Renovar</Link>}
          </div>
        )}
        {plan && !plan.is_usable && (
          <div className="bg-volt-amber/15 px-4 py-2.5 text-center text-sm text-amber-300">
            Tu suscripción venció: tus clientes no pueden reservar online. {can('manage') && <Link to="/panel/plan" className="underline font-semibold">Pagar ahora</Link>}
          </div>
        )}
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
