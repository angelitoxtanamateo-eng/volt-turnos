import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, X, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { hmInTz, longDate, todayInTz, ymdInTz, addDays } from '../lib/time'

interface Toast { id: string; kind: 'new' | 'cancel'; client: string; startsAt: string }

/** Avisa en vivo cuando un cliente reserva (o cancela) solo desde el link */
export default function BookingToasts({ businessId, tz }: { businessId: string; tz: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    const push = async (row: { id: string; client_id: string; starts_at: string }, kind: Toast['kind']) => {
      const { data } = await supabase.from('clients').select('name').eq('id', row.client_id).maybeSingle()
      const t: Toast = { id: `${row.id}-${kind}`, kind, client: (data as { name: string } | null)?.name ?? 'Un cliente', startsAt: row.starts_at }
      setToasts((v) => [t, ...v.filter((x) => x.id !== t.id)].slice(0, 3))
      try { navigator.vibrate?.(120) } catch { /* sin vibración */ }
      setTimeout(() => setToasts((v) => v.filter((x) => x.id !== t.id)), 12000)
    }
    const ch = supabase.channel(`toasts-${businessId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments', filter: `business_id=eq.${businessId}` }, (p) => {
        const r = p.new as { id: string; client_id: string; starts_at: string; source: string }
        if (r.source === 'online') push(r, 'new')
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `business_id=eq.${businessId}` }, (p) => {
        const r = p.new as { id: string; client_id: string; starts_at: string; status: string; cancelled_by: string | null }
        if (r.status === 'cancelled' && r.cancelled_by === 'client') push(r, 'cancel')
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [businessId])

  if (!toasts.length) return null
  const today = todayInTz(tz)
  const dayLabel = (iso: string) => {
    const d = ymdInTz(iso, tz)
    return d === today ? 'hoy' : d === addDays(today, 1) ? 'mañana' : longDate(d)
  }

  return (
    <div className="fixed inset-x-3 top-3 z-[60] flex flex-col items-center gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-96">
      {toasts.map((t) => (
        <div key={t.id} className="flex w-full items-start gap-3 rounded-2xl border border-volt-line bg-volt-card/95 p-4 shadow-2xl backdrop-blur animate-fade-up">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.kind === 'new' ? 'bg-volt-green/15 text-volt-green' : 'bg-volt-red/15 text-volt-red'}`}>
            {t.kind === 'new' ? <CalendarPlus className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          </span>
          <button className="min-w-0 flex-1 text-left" onClick={() => { setToasts((v) => v.filter((x) => x.id !== t.id)); navigate('/panel/agenda') }}>
            <div className="text-sm font-semibold">{t.kind === 'new' ? '¡Nueva reserva online!' : 'Un cliente canceló'}</div>
            <div className="text-sm text-volt-muted">
              <b className="text-volt-white">{t.client}</b> · {dayLabel(t.startsAt)} a las {hmInTz(t.startsAt, tz)}
            </div>
          </button>
          <button onClick={() => setToasts((v) => v.filter((x) => x.id !== t.id))} className="rounded-lg p-1 text-volt-muted hover:text-volt-white" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}
