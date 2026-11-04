import { useEffect, useState } from 'react'
import { CheckCircle2, UserX, XCircle, CalendarClock, MessageCircle, Phone, RotateCcw, Globe } from 'lucide-react'
import { supabase, errorMessage } from '../../../lib/supabase'
import { Alert, Field, Spinner } from '../../../components/ui'
import Modal from '../../../components/Modal'
import { APPT_STATUS, PAY_METHODS, ars, servicesLabel, type Appointment, type PayMethod, type Professional } from '../../../lib/types'
import { hmInTz, longDate, ymdInTz, zonedToIso } from '../../../lib/time'
import { waLink } from '../../../lib/share'
import { manageUrl, msgCancel, msgConfirm, msgReminder, msgReschedule } from '../../../lib/messages'

interface Props {
  appt: Appointment | null
  onClose: () => void
  onChanged: () => void
  tz: string
  businessName: string
  address: string | null
  pros: Professional[]
  canCharge: boolean
}

export default function AppointmentDetail({ appt, onClose, onChanged, tz, businessName, address, pros, canCharge }: Props) {
  const [mode, setMode] = useState<'view' | 'charge' | 'move'>('view')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<'cancel' | 'move' | null>(null)

  useEffect(() => {
    if (!appt) return
    setMode('view'); setError(''); setNotice(null)
    setAmount(String(Number(appt.total_price)))
    setMethod('cash')
    setDate(ymdInTz(appt.starts_at, tz))
    setTime(hmInTz(appt.starts_at, tz))
  }, [appt, tz])

  useEffect(() => {
    if (!appt || mode !== 'move' || !date) return
    const ids = appt.appointment_services.map((s) => s.service_id).filter(Boolean) as string[]
    if (!ids.length) { setSlots([]); return }
    setSlots(null)
    supabase.rpc('staff_available_slots', { p_business: appt.business_id, p_service_ids: ids, p_professional_id: appt.professional_id, p_date: date, p_exclude: appt.id })
      .then(({ data }) => setSlots(((data ?? []) as { t: string }[]).map((x) => hmInTz(x.t, tz))))
  }, [appt, mode, date, tz])

  if (!appt) return null
  const a = appt
  const pro = pros.find((x) => x.id === a.professional_id)
  const client = a.clients
  const st = APPT_STATUS[a.status]
  const ctx = { businessName, clientName: client?.name ?? 'cliente', startsAt: a.starts_at, tz, services: servicesLabel(a), professional: pro?.name ?? '', address, manageUrl: manageUrl(a.manage_token) }
  const durMin = Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000)

  async function setStatus(status: Appointment['status']) {
    setError(''); setBusy(true)
    const { error } = await supabase.from('appointments').update({ status, ...(status === 'cancelled' ? { cancelled_by: 'business' } : {}) }).eq('id', a.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    onChanged()
    if (status === 'cancelled' && client?.phone) setNotice('cancel')
    else onClose()
  }

  async function charge() {
    setError('')
    const n = Number(amount.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return setError('Monto inválido')
    setBusy(true)
    const { error } = await supabase.rpc('complete_appointment', { p_appointment: a.id, p_amount: n, p_method: method })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    onChanged(); onClose()
  }

  async function move() {
    setError('')
    if (!date || !/^\d{2}:\d{2}$/.test(time)) return setError('Elegí día y hora')
    const start = zonedToIso(date, time, tz)
    const end = new Date(new Date(start).getTime() + durMin * 60000).toISOString()
    setBusy(true)
    const { error } = await supabase.from('appointments').update({ starts_at: start, ends_at: end }).eq('id', a.id)
    setBusy(false)
    if (error) return setError(error.code === '23P01' ? 'Ese horario se superpone con otro turno del profesional' : errorMessage(error))
    onChanged()
    if (client?.phone) { setNotice('move'); setMode('view') } else onClose()
  }

  const wa = (text: string) => waLink(text, client?.phone)
  const moved = { ...ctx, startsAt: date && time ? zonedToIso(date, time, tz) : a.starts_at }

  return (
    <Modal open onClose={onClose} title="Turno">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {notice && (
          <div className="rounded-xl border border-volt-green/30 bg-volt-green/10 p-3.5 text-sm">
            <p className="font-semibold text-green-300">{notice === 'cancel' ? 'Turno cancelado' : 'Turno movido'}. ¿Le avisás al cliente?</p>
            <a className="btn-primary mt-3 w-full bg-[#25D366] shadow-none hover:bg-[#1ebe5b]" target="_blank" rel="noreferrer"
              href={wa(notice === 'cancel' ? msgCancel(ctx) : msgReschedule(moved))} onClick={onClose}>
              <MessageCircle className="h-4 w-4" /> Avisar por WhatsApp
            </a>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-bold">{hmInTz(a.starts_at, tz)} <span className="text-base font-medium text-volt-muted">a {hmInTz(a.ends_at, tz)}</span></div>
            <div className="text-sm capitalize text-volt-muted">{longDate(ymdInTz(a.starts_at, tz))}</div>
          </div>
          <span className={`chip ${st.cls}`}>{st.label}</span>
        </div>

        <div className="rounded-xl border border-volt-line p-3.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{client?.name}</span>
            {a.source === 'online' && <span className="chip bg-volt-violet/10 text-volt-violet2"><Globe className="h-3 w-3" /> Online</span>}
          </div>
          {client?.phone && <a href={`tel:${client.phone}`} className="mt-1 flex items-center gap-1.5 text-volt-muted"><Phone className="h-3.5 w-3.5" /> {client.phone}</a>}
          <div className="mt-3 text-volt-muted">{servicesLabel(a)} · {pro?.name}</div>
          <div className="mt-1 font-semibold">{ars(Number(a.total_price))}</div>
          {a.notes && <div className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-volt-muted">📝 {a.notes}</div>}
          {a.status === 'cancelled' && <div className="mt-2 text-xs text-volt-muted">Cancelado por {a.cancelled_by === 'client' ? 'el cliente' : 'el negocio'}</div>}
        </div>

        {client?.phone && a.status === 'confirmed' && mode === 'view' && !notice && (
          <div className="grid grid-cols-2 gap-2">
            <a className="btn-ghost text-sm" target="_blank" rel="noreferrer" href={wa(msgConfirm(ctx))}><MessageCircle className="h-4 w-4 text-[#25D366]" /> Confirmación</a>
            <a className="btn-ghost text-sm" target="_blank" rel="noreferrer" href={wa(msgReminder(ctx))}><MessageCircle className="h-4 w-4 text-[#25D366]" /> Recordatorio</a>
          </div>
        )}

        {mode === 'charge' && (
          <div className="space-y-3 rounded-xl border border-volt-green/30 bg-volt-green/5 p-3.5">
            <div className="text-sm font-semibold">Completar y cobrar</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto cobrado"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Medio de pago">
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                  {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <p className="text-xs text-volt-muted">Poné 0 si no cobraste ahora: el turno queda completado sin ingreso.</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setMode('view')}>Volver</button>
              <button className="btn-primary flex-1 bg-volt-green hover:bg-green-500" onClick={charge} disabled={busy}>{busy ? <Spinner /> : 'Confirmar cobro'}</button>
            </div>
          </div>
        )}

        {mode === 'move' && (
          <div className="space-y-3 rounded-xl border border-volt-line p-3.5">
            <div className="text-sm font-semibold">Cambiar día u hora</div>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            {slots === null ? <Spinner className="h-4 w-4 text-volt-muted" /> : slots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {slots.map((t) => (
                  <button key={t} onClick={() => setTime(t)} className={`rounded-lg border px-3 py-1.5 text-sm ${time === t ? 'border-volt-violet bg-volt-violet text-white' : 'border-volt-line'}`}>{t}</button>
                ))}
              </div>
            )}
            <input type="time" step={300} className="input max-w-[10rem]" value={time} onChange={(e) => setTime(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setMode('view')}>Volver</button>
              <button className="btn-primary flex-1" onClick={move} disabled={busy}>{busy ? <Spinner /> : 'Guardar cambio'}</button>
            </div>
          </div>
        )}

        {mode === 'view' && !notice && (
          <div className="grid grid-cols-2 gap-2">
            {a.status === 'confirmed' && (
              <>
                <button className="btn-primary col-span-2 bg-volt-green hover:bg-green-500" onClick={() => canCharge ? setMode('charge') : setStatus('completed')} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> {canCharge ? 'Completar y cobrar' : 'Marcar completado'}
                </button>
                <button className="btn-ghost text-sm" onClick={() => setMode('move')}><CalendarClock className="h-4 w-4" /> Reprogramar</button>
                <button className="btn-ghost text-sm text-volt-amber" onClick={() => setStatus('no_show')} disabled={busy}><UserX className="h-4 w-4" /> Ausente</button>
                <button className="btn-danger col-span-2 text-sm" onClick={() => confirm('¿Cancelar este turno?') && setStatus('cancelled')} disabled={busy}><XCircle className="h-4 w-4" /> Cancelar turno</button>
              </>
            )}
            {(a.status === 'no_show' || a.status === 'cancelled') && (
              <button className="btn-ghost col-span-2 text-sm" onClick={() => setStatus('confirmed')} disabled={busy}><RotateCcw className="h-4 w-4" /> Volver a confirmado</button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
