import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarClock, Users, Wallet, Check, Circle, Copy, Share2, ArrowRight, UserX, Gauge, TrendingUp, Globe, ExternalLink } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBusiness } from '../../context/BusinessContext'
import { supabase } from '../../lib/supabase'
import { PageHeader, StatCard } from '../../components/ui'
import { copyText, publicUrl, waLink } from '../../lib/share'
import { ars } from '../../lib/types'
import { hmInTz, shortDate, todayInTz, ymdInTz } from '../../lib/time'

interface Stats {
  today: number; upcoming: number; clients: number; income_today: number | null; income_month: number | null
  no_shows_month: number; occupancy_today: number | null
  top_services: { name: string; qty: number }[]
  next: { id: string; starts_at: string; client: string; professional: string; services: string }[]
}

export default function Dashboard() {
  const { profile } = useAuth()
  const { current, can } = useBusiness()
  const b = current!.business
  const tz = b.timezone
  const [stats, setStats] = useState<Stats | null>(null)
  const [setup, setSetup] = useState<{ services: number; pros: number; hours: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [online, setOnline] = useState<{ id: string; starts_at: string; created_at: string; status: string; clients: { name: string } | null }[] | null>(null)

  useEffect(() => {
    const loadLive = () => {
      supabase.rpc('dashboard_stats', { p_business: b.id }).then(({ data }) => setStats(data as Stats))
      supabase.from('appointments').select('id, starts_at, created_at, status, clients(name)').eq('business_id', b.id).eq('source', 'online')
        .order('created_at', { ascending: false }).limit(5).then(({ data }) => setOnline((data ?? []) as unknown as typeof online))
    }
    loadLive()
    const ch = supabase.channel(`dash-${b.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${b.id}` }, () => loadLive())
      .subscribe()
    Promise.all([
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('business_id', b.id).eq('is_active', true),
      supabase.from('professionals').select('id', { count: 'exact', head: true }).eq('business_id', b.id).eq('is_active', true),
      supabase.from('working_hours').select('id', { count: 'exact', head: true }).eq('business_id', b.id),
    ]).then(([s, p, h]) => setSetup({ services: s.count ?? 0, pros: p.count ?? 0, hours: h.count ?? 0 }))
    return () => { supabase.removeChannel(ch) }
  }, [b.id])

  const url = publicUrl(b.slug)
  const steps = [
    { done: (setup?.services ?? 0) > 0, label: 'Cargar tus servicios y precios', to: '/panel/servicios' },
    { done: (setup?.pros ?? 0) > 0 && (setup?.hours ?? 0) > 0, label: 'Agregar profesionales con sus horarios', to: '/panel/profesionales' },
    { done: Boolean(b.whatsapp), label: 'Cargar WhatsApp y dirección', to: '/panel/negocio' },
    { done: b.is_published, label: 'Publicar tu página de reservas', to: '/panel/negocio' },
  ]
  const progress = steps.filter((s) => s.done).length
  const hello = profile?.full_name?.split(' ')[0]
  const manager = can('manage')
  const today = todayInTz(tz)

  return (
    <div>
      <PageHeader title={`Hola${hello ? `, ${hello}` : ''} 👋`} subtitle={`Esto es lo que pasa hoy en ${b.name}`}
        action={<Link to="/panel/agenda" className="btn-primary py-2.5 text-sm"><CalendarCheck className="h-4 w-4" /> Ver agenda</Link>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Turnos hoy" value={stats?.today ?? '…'} icon={<CalendarCheck className="h-4 w-4" />} />
        <StatCard label="Próx. 7 días" value={stats?.upcoming ?? '…'} icon={<CalendarClock className="h-4 w-4" />} />
        {manager ? (
          <>
            <StatCard label="Ingresos hoy" value={stats ? ars(Number(stats.income_today ?? 0)) : '…'} icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Ingresos del mes" value={stats ? ars(Number(stats.income_month ?? 0)) : '…'} icon={<TrendingUp className="h-4 w-4" />} />
          </>
        ) : (
          <StatCard label="Clientes" value={stats?.clients ?? '…'} icon={<Users className="h-4 w-4" />} />
        )}
        <StatCard label="Ocupación hoy" value={stats ? (stats.occupancy_today === null ? '—' : `${stats.occupancy_today}%`) : '…'} icon={<Gauge className="h-4 w-4" />} note={stats?.occupancy_today === null ? 'No hay horarios hoy' : 'De las horas de trabajo'} />
        <StatCard label="Ausencias del mes" value={stats?.no_shows_month ?? '…'} icon={<UserX className="h-4 w-4" />} />
        {manager && <StatCard label="Clientes" value={stats?.clients ?? '…'} icon={<Users className="h-4 w-4" />} />}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-volt-line px-5 py-4">
            <h2 className="font-semibold">Próximos turnos</h2>
            <Link to="/panel/agenda" className="text-sm text-volt-violet2">Agenda <ArrowRight className="inline h-3.5 w-3.5" /></Link>
          </div>
          {!stats ? <div className="px-5 py-6 text-sm text-volt-muted">Cargando…</div> : stats.next.length === 0 ? (
            <div className="px-5 py-6 text-sm text-volt-muted">No hay turnos próximos.</div>
          ) : (
            <ul className="divide-y divide-volt-line">
              {stats.next.map((n) => {
                const d = ymdInTz(n.starts_at, tz)
                return (
                  <li key={n.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-14 shrink-0 text-center">
                      <div className="text-lg font-bold leading-none">{hmInTz(n.starts_at, tz)}</div>
                      <div className="mt-1 text-[11px] text-volt-muted">{d === today ? 'Hoy' : shortDate(d)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{n.client}</div>
                      <div className="truncate text-xs text-volt-muted">{n.services} · {n.professional}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="space-y-4 lg:col-span-2">
          {manager && progress < steps.length && (
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Puesta en marcha</h2>
                <span className="text-sm text-volt-muted">{progress}/{steps.length}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-volt-line">
                <div className="h-full rounded-full bg-volt-violet transition-all" style={{ width: `${(progress / steps.length) * 100}%` }} />
              </div>
              <ul className="mt-3 space-y-1">
                {steps.map((s) => (
                  <li key={s.label}>
                    {!s.done ? (
                      <Link to={s.to} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-white/5">
                        <Circle className="h-5 w-5 text-volt-muted" /><span className="flex-1">{s.label}</span><ArrowRight className="h-4 w-4 text-volt-muted" />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2.5 text-sm text-volt-muted">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-volt-green text-volt-bg"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                        <span className="line-through decoration-volt-muted/40">{s.label}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="flex items-center justify-between border-b border-volt-line px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><Globe className="h-4 w-4 text-volt-violet2" /> Reservas online</h2>
              <span className="flex items-center gap-1.5 text-xs text-volt-green"><span className="h-2 w-2 animate-pulse rounded-full bg-volt-green" /> En vivo</span>
            </div>
            {!online ? <div className="px-5 py-4 text-sm text-volt-muted">Cargando…</div> : online.length === 0 ? (
              <div className="px-5 py-4 text-sm text-volt-muted">
                Todavía nadie reservó solo. Compartí tu link: cuando un cliente saque turno, aparece acá y en la agenda sin que cargues nada.
              </div>
            ) : (
              <ul className="divide-y divide-volt-line">
                {online.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${o.status === 'cancelled' ? 'bg-volt-muted' : 'bg-volt-green'}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate font-medium ${o.status === 'cancelled' ? 'line-through text-volt-muted' : ''}`}>{o.clients?.name}</div>
                      <div className="text-xs text-volt-muted">Para el {shortDate(ymdInTz(o.starts_at, tz))} a las {hmInTz(o.starts_at, tz)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">Tu link de reservas</h2>
            <p className="mt-1 text-sm text-volt-muted">{b.is_published ? 'Compartilo en Instagram y WhatsApp.' : 'Todavía no está publicado: solo vos y tu equipo lo ven.'}</p>
            <div className="mt-4 truncate rounded-xl border border-volt-line bg-volt-bg px-3.5 py-3 font-mono text-sm text-volt-violet2">{url.replace(/^https?:\/\//, '')}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1800) } }}>
                {copied ? <Check className="h-4 w-4 text-volt-green" /> : <Copy className="h-4 w-4" />} {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a className="btn-ghost" href={waLink(`¡Reservá tu turno en ${b.name}! 👉 ${url}`)} target="_blank" rel="noreferrer"><Share2 className="h-4 w-4" /> WhatsApp</a>
            </div>
            <a className="btn-primary mt-2 w-full" href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Probar como cliente</a>
          </section>

          {stats && stats.top_services.length > 0 && (
            <section className="card p-5">
              <h2 className="font-semibold">Más vendidos del mes</h2>
              <ul className="mt-3 space-y-2.5">
                {stats.top_services.map((s) => (
                  <li key={s.name}>
                    <div className="flex justify-between text-sm"><span>{s.name}</span><b>{s.qty}</b></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-volt-line"><div className="h-full rounded-full bg-volt-violet" style={{ width: `${(s.qty / stats.top_services[0].qty) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
