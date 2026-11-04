import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export function Logo({ size = 'md', to = '/' }: { size?: 'sm' | 'md' | 'lg'; to?: string }) {
  const box = size === 'lg' ? 'h-11 w-11' : size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 select-none">
      <span className={`${box} grid place-items-center rounded-xl bg-volt-violet shadow-lg shadow-volt-violet/30`}>
        <svg viewBox="0 0 64 64" className="h-[60%] w-[60%]" aria-hidden>
          <path d="M36 4 14 38h14l-4 22 26-36H34l2-20z" fill="#F8FAFC" />
        </svg>
      </span>
      <span className={`${text} font-extrabold tracking-tight`}>
        VOLT <span className="text-volt-violet2 font-semibold">Turnos</span>
      </span>
    </Link>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin ${className}`} />
}

export function FullScreenLoader() {
  return (
    <div className="min-h-[100dvh] grid place-items-center">
      <Spinner className="h-7 w-7 text-volt-violet" />
    </div>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success'; children: ReactNode }) {
  const cls =
    kind === 'error'
      ? 'bg-volt-red/10 border-volt-red/30 text-red-300'
      : 'bg-volt-green/10 border-volt-green/30 text-green-300'
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm animate-fade-up ${cls}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-volt-muted">{hint}</span>}
    </label>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-volt-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function StatCard({ label, value, icon, note }: { label: string; value: ReactNode; icon: ReactNode; note?: string }) {
  return (
    <div className="card p-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-volt-muted">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-volt-violet/15 text-volt-violet2">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      {note && <div className="mt-1 text-xs text-volt-muted">{note}</div>}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-volt-violet/15 text-volt-violet2">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-volt-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
