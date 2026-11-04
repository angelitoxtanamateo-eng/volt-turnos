import { useEffect, useState } from 'react'
import { supabase, errorMessage } from '../../../lib/supabase'
import { Alert, Field, Spinner } from '../../../components/ui'
import Modal from '../../../components/Modal'
import type { Professional } from '../../../lib/types'
import { addDays, zonedToIso } from '../../../lib/time'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  businessId: string
  tz: string
  pros: Professional[]
  defaultDate: string
  lockedProfessionalId?: string | null
  canBlockAll: boolean
}

export default function BlockTime(p: Props) {
  const [pro, setPro] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [from, setFrom] = useState('13:00')
  const [to, setTo] = useState('14:00')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!p.open) return
    setPro(p.lockedProfessionalId ?? ''); setFromDate(p.defaultDate); setToDate(p.defaultDate)
    setAllDay(false); setFrom('13:00'); setTo('14:00'); setReason(''); setError('')
  }, [p.open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError('')
    if (!fromDate || !toDate || toDate < fromDate) return setError('Revisá las fechas')
    const start = zonedToIso(fromDate, allDay ? '00:00' : from, p.tz)
    const end = allDay ? zonedToIso(addDays(toDate, 1), '00:00', p.tz) : zonedToIso(toDate, to, p.tz)
    if (end <= start) return setError('El fin debe ser después del inicio')
    setBusy(true)
    const { error } = await supabase.from('time_off').insert({
      business_id: p.businessId, professional_id: pro || null, starts_at: start, ends_at: end, reason: reason.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    p.onCreated(); p.onClose()
  }

  return (
    <Modal open={p.open} onClose={p.onClose} title="Bloquear horario"
      footer={<button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Bloquear'}</button>}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-volt-muted">En ese rango no se van a poder reservar turnos online. Sirve para feriados, vacaciones, trámites o almuerzo.</p>
        <Field label="Para">
          <select className="input" value={pro} disabled={!!p.lockedProfessionalId} onChange={(e) => setPro(e.target.value)}>
            {p.canBlockAll && <option value="">Todo el negocio</option>}
            {p.pros.filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde el día"><input type="date" className="input" value={fromDate} onChange={(e) => { setFromDate(e.target.value); if (toDate < e.target.value) setToDate(e.target.value) }} /></Field>
          <Field label="Hasta el día"><input type="date" className="input" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-volt-violet" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Día(s) completo(s)
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora inicio"><input type="time" step={300} className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Hora fin"><input type="time" step={300} className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Motivo (opcional)"><input className="input" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feriado" /></Field>
      </div>
    </Modal>
  )
}
