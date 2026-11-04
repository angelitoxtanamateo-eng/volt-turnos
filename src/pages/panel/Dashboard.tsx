import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarClock, Users, Wallet, Check, Circle, Copy, Share2, ArrowRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBusiness } from '../../context/BusinessContext'
import { supabase } from '../../lib/supabase'
import { PageHeader, StatCard } from '../../components/ui'
import { copyText, publicUrl, waLink } from '../../lib/share'

export default function Dashboard() {
  const { profile } = useAuth()
  const { current, can } = useBusiness()
  const [members, setMembers] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const b = current!.business

  useEffect(() => {
    supabase.from('business_members').select('id', { count: 'exact', head: true }).eq('business_id', b.id)
      .then(({ count }) => setMembers(count ?? 0))
  }, [b.id])

  const url = publicUrl(b.slug)
  const steps = [
    { done: true, label: 'Crear tu negocio', to: null },
    { done: Boolean(b.whatsapp || b.phone), label: 'Cargar WhatsApp y dirección', to: '/panel/negocio' },
    { done: (members ?? 0) > 1, label: 'Invitar a tu equipo (opcional)', to: '/panel/equipo' },
    { done: b.is_published, label: 'Publicar tu página de reservas', to: '/panel/negocio' },
  ]
  const progress = steps.filter((s) => s.done).length
  const hello = profile?.full_name?.split(' ')[0]

  return (
    <div>
      <PageHeader title={`Hola${hello ? `, ${hello}` : ''} 👋`} subtitle={`Esto es lo que pasa hoy en ${b.name}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Turnos hoy" value="0" icon={<CalendarCheck className="h-4 w-4" />} note="Se activa con la agenda" />
        <StatCard label="Próximos" value="0" icon={<CalendarClock className="h-4 w-4" />} note="Se activa con la agenda" />
        <StatCard label="Equipo" value={members ?? '…'} icon={<Users className="h-4 w-4" />} note="Personas con acceso" />
        <StatCard label="Ingresos hoy" value="$ 0" icon={<Wallet className="h-4 w-4" />} note="Se activa con la caja" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        {can('manage') && (
          <section className="card p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Puesta en marcha</h2>
              <span className="text-sm text-volt-muted">{progress}/{steps.length}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-volt-line">
              <div className="h-full rounded-full bg-volt-violet transition-all" style={{ width: `${(progress / steps.length) * 100}%` }} />
            </div>
            <ul className="mt-4 space-y-1">
              {steps.map((s) => (
                <li key={s.label}>
                  {s.to && !s.done ? (
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

        <section className={`card p-5 ${can('manage') ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
          <h2 className="font-semibold">Tu link de reservas</h2>
          <p className="mt-1 text-sm text-volt-muted">
            {b.is_published ? 'Compartilo en Instagram y WhatsApp.' : 'Todavía no está publicado: solo vos y tu equipo lo pueden ver.'}
          </p>
          <div className="mt-4 truncate rounded-xl border border-volt-line bg-volt-bg px-3.5 py-3 font-mono text-sm text-volt-violet2">{url.replace(/^https?:\/\//, '')}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1800) } }}>
              {copied ? <Check className="h-4 w-4 text-volt-green" /> : <Copy className="h-4 w-4" />} {copied ? 'Copiado' : 'Copiar'}
            </button>
            <a className="btn-ghost" href={waLink(`¡Reservá tu turno en ${b.name}! 👉 ${url}`)} target="_blank" rel="noreferrer">
              <Share2 className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
