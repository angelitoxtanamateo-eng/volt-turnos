import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarClock, XCircle, MessageCircle, MapPin, Loader2, ArrowLeft, Check } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { FullScreenLoader, Logo } from '../components/ui'
import { DateStrip, SlotGrid, makeTheme } from '../components/booking'
import { waLink } from '../lib/share'
import { ars } from '../lib/types'
import { hmInTz, longDate, todayInTz, ymdInTz } from '../lib/time'

interface Booking {
  token: string; starts_at: string; ends_at: string; status: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  total_price: number; client_name: string; can_change: boolean
  professional: { name: string }; services: { name: string }[]
  business: { name: string; slug: string; whatsapp: string | null; address: string | null; city: string | null; timezone: string; logo_url: string | null
    primary_color: string; secondary_color: string; background_color: string; cancel_limit_hours: number; max_days_ahead: number }
}

export default function ManageBooking() {
  const { token = '' } = useParams()
  const [bk, setBk] = useState<Booking | null | undefined>(undefined)
  const [mode, setMode] = useState<'view' | 'move'>('view')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<{ t: string }[] | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const valid = /^[0-9a-f-]{36}$/i.test(token)
    if (!valid) { setBk(null); return }
    const { data } = await supabase.rpc('get_booking', { p_token: token })
    setBk((data as Booking) ?? null)
  }, [token])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (mode !== 'move' || !date) return
    setSlots(null); setSlot(null)
    supabase.rpc('get_reschedule_slots', { p_token: token, p_date: date }).then(({ data }) => setSlots((data ?? []) as { t: string }[]))
  }, [mode, date, token])

  if (bk === undefined) return <FullScreenLoader />
  if (!bk) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-4 text-center">
        <div><Logo /><h1 className="mt-8 text-2xl font-bold">No encontramos este turno</h1><p className="mt-2 text-sm text-volt-muted">Revisá el link que recibiste.</p></div>
      </div>
    )
  }

  const b = bk.business
  const tz = b.timezone
  const t = makeTheme(b.primary_color, b.background_color)
  const card = { background: t.card, borderColor: t.line }
  const address = [b.address, b.city].filter(Boolean).join(', ')
  const services = bk.services.map((s) => s.name).join(' + ')

  async function cancel() {
    if (!confirm('¿Seguro que querés cancelar tu turno?')) return
    setError(''); setBusy(true)
    const { data, error } = await supabase.rpc('cancel_booking', { p_token: token })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setBk(data as Booking); setDone('Tu turno quedó cancelado.')
  }

  async function move() {
    if (!slot) return
    setError(''); setBusy(true)
    const { data, error } = await supabase.rpc('reschedule_booking', { p_token: token, p_starts_at: slot })
    setBusy(false)
    if (error) {
      setError(errorMessage(error)); setSlot(null); setSlots(null)
      const { data: fresh } = await supabase.rpc('get_reschedule_slots', { p_token: token, p_date: date })
      setSlots((fresh ?? []) as { t: string }[])
      return
    }
    setBk(data as Booking); setMode('view'); setDone('¡Listo! Tu turno se cambió.')
  }

  const statusLabel = { confirmed: 'Confirmado', completed: 'Realizado', cancelled: 'Cancelado', no_show: 'No asistió' }[bk.status]

  return (
    <div className="min-h-[100dvh] px-4 pb-16 pt-8" style={{ background: t.bg, color: t.fg }}>
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl font-extrabold" style={{ background: t.primary, color: t.onPrimary }}>
            {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full object-cover" /> : b.name.charAt(0).toUpperCase()}
          </div>
          <div><div className="text-sm" style={{ color: t.muted }}>Tu turno en</div><div className="text-lg font-bold">{b.name}</div></div>
        </div>

        {done && <div className="mt-5 flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-600"><Check className="h-4 w-4" /> {done}</div>}
        {error && <div className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

        {mode === 'view' ? (
          <>
            <div className="mt-5 rounded-2xl border p-5" style={card}>
              <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: bk.status === 'confirmed' ? `${t.primary}26` : t.card, color: bk.status === 'cancelled' ? t.muted : t.fg }}>{statusLabel}</span>
              <div className={`mt-3 text-lg font-bold capitalize ${bk.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{longDate(ymdInTz(bk.starts_at, tz))}</div>
              <div className={`text-3xl font-extrabold ${bk.status === 'cancelled' ? 'line-through opacity-60' : ''}`} style={{ color: t.primary }}>{hmInTz(bk.starts_at, tz)} hs</div>
              <div className="mt-3 text-sm">{services} con <b>{bk.professional.name}</b></div>
              <div className="mt-1 text-sm" style={{ color: t.muted }}>A nombre de {bk.client_name} · {ars(Number(bk.total_price))}</div>
              {address && <div className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: t.muted }}><MapPin className="h-3.5 w-3.5" /> {address}</div>}
            </div>

            {bk.can_change ? (
              <div className="mt-4 grid gap-2.5">
                <button onClick={() => { setMode('move'); setDone(''); setDate(ymdInTz(bk.starts_at, tz) >= todayInTz(tz) ? ymdInTz(bk.starts_at, tz) : todayInTz(tz)) }}
                  className="flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-bold" style={{ background: t.primary, color: t.onPrimary }}>
                  <CalendarClock className="h-5 w-5" /> Cambiar día u horario
                </button>
                <button onClick={cancel} disabled={busy} className="flex items-center justify-center gap-2 rounded-2xl border px-5 py-3.5 font-semibold text-red-500" style={card}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />} Cancelar turno
                </button>
              </div>
            ) : bk.status === 'confirmed' ? (
              <p className="mt-4 text-sm" style={{ color: t.muted }}>Ya no se puede cambiar online (hasta {b.cancel_limit_hours} h antes). Escribile al negocio.</p>
            ) : null}

            <div className="mt-4 grid gap-2.5">
              {b.whatsapp && (
                <a className="flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-semibold text-white" style={{ background: '#25D366' }} target="_blank" rel="noreferrer"
                  href={waLink(`Hola ${b.name}! Soy ${bk.client_name}, tengo un turno el ${longDate(ymdInTz(bk.starts_at, tz))} a las ${hmInTz(bk.starts_at, tz)}.`, b.whatsapp)}>
                  <MessageCircle className="h-5 w-5" /> Escribir al negocio
                </a>
              )}
              <Link to={`/${b.slug}`} className="rounded-2xl border px-5 py-3.5 text-center font-semibold" style={card}>Sacar otro turno</Link>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setMode('view')} className="mt-6 flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Volver</button>
            <h2 className="mt-4 text-lg font-bold">Elegí el nuevo horario</h2>
            <p className="text-sm" style={{ color: t.muted }}>{services} con {bk.professional.name}</p>
            <div className="mt-4"><DateStrip from={todayInTz(tz)} days={Math.min(b.max_days_ahead + 1, 60)} value={date} onChange={setDate} t={t} /></div>
            <div className="mt-4">
              {slots === null ? <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: t.primary }} /></div>
                : slots.length === 0 ? <div className="rounded-2xl border p-6 text-center text-sm" style={{ ...card, color: t.muted }}>No hay horarios este día.</div>
                : <SlotGrid slots={slots.map((s) => ({ t: s.t, label: hmInTz(s.t, tz) }))} value={slot} onChange={setSlot} t={t} />}
            </div>
            <button onClick={move} disabled={!slot || busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-bold disabled:opacity-50" style={{ background: t.primary, color: t.onPrimary }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar cambio {slot && `a las ${hmInTz(slot, tz)}`}
            </button>
          </>
        )}
        <p className="mt-10 text-center text-xs" style={{ color: t.muted }}>Turnos con <Link to="/" className="font-semibold underline">VOLT Turnos</Link> ⚡</p>
      </div>
    </div>
  )
}
