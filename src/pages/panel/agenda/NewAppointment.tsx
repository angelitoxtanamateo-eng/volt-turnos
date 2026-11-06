import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, Check } from 'lucide-react'
import { supabase, errorMessage } from '../../../lib/supabase'
import { Alert, Field, Spinner } from '../../../components/ui'
import Modal from '../../../components/Modal'
import { ars, qtyLabel, type Professional, type Service } from '../../../lib/types'
import { fmtDuration, hmInTz, todayInTz, zonedToIso } from '../../../lib/time'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  businessId: string
  tz: string
  services: Service[]
  pros: Professional[]
  proServices: Record<string, string[]>
  defaults?: { date?: string; time?: string; professionalId?: string }
  lockedProfessionalId?: string | null
}

interface ClientHit { id: string; name: string; phone: string | null }

export default function NewAppointment(p: Props) {
  const [clientQuery, setClientQuery] = useState('')
  const [hits, setHits] = useState<ClientHit[]>([])
  const [client, setClient] = useState<ClientHit | null>(null)
  const [newClient, setNewClient] = useState({ name: '', phone: '' })
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [svc, setSvc] = useState<string[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})
  const [pro, setPro] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [slots, setSlots] = useState<{ hm: string; left: number | null }[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!p.open) return
    setClientQuery(''); setHits([]); setClient(null); setNewClient({ name: '', phone: '' }); setMode('search')
    setSvc([]); setQty({}); setNotes(''); setError('')
    setPro(p.lockedProfessionalId ?? p.defaults?.professionalId ?? '')
    setDate(p.defaults?.date ?? todayInTz(p.tz))
    setTime(p.defaults?.time ?? '')
  }, [p.open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda de clientes
  useEffect(() => {
    const q = clientQuery.trim()
    if (q.length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const digits = q.replace(/\D/g, '')
      let req = supabase.from('clients').select('id, name, phone').eq('business_id', p.businessId).limit(8)
      req = digits.length >= 3 ? req.ilike('phone_norm', `%${digits}%`) : req.ilike('name', `%${q.replace(/[%_]/g, '')}%`)
      const { data } = await req
      setHits((data ?? []) as ClientHit[])
    }, 250)
    return () => clearTimeout(t)
  }, [clientQuery, p.businessId])

  const activeServices = p.services.filter((s) => s.is_active || svc.includes(s.id))
  const eligiblePros = useMemo(
    () => p.pros.filter((x) => x.is_active && svc.every((sid) => (p.proServices[x.id] ?? []).includes(sid))),
    [p.pros, p.proServices, svc],
  )
  useEffect(() => { if (pro && !eligiblePros.some((x) => x.id === pro) && !p.lockedProfessionalId) setPro('') }, [eligiblePros, pro, p.lockedProfessionalId])

  const totalMin = svc.reduce((a, id) => a + (p.services.find((s) => s.id === id)?.duration_min ?? 0), 0)
  const chosen = p.services.filter((s) => svc.includes(s.id))
  const isUnit = (s: Service) => !!s.unit_label
  const isClass = (s: Service) => !s.unit_label && s.capacity > 1
  const units = chosen.filter(isUnit)
  const groupSvc = chosen.length === 1 && isClass(chosen[0]) ? chosen[0] : null
  const qOf = (s: Service) => (isUnit(s) ? qty[s.id] ?? 1 : 1)
  const totalPrice = chosen.reduce((a, s) => a + Number(s.price_ars) * qOf(s), 0)
  function toggle(s: Service) {
    if (svc.includes(s.id)) return setSvc(svc.filter((x) => x !== s.id))
    setSvc(isClass(s) || chosen.some(isClass) || chosen.some((c) => isUnit(c) !== isUnit(s)) ? [s.id] : [...svc, s.id])
  }

  // Horarios libres sugeridos (según horario laboral)
  useEffect(() => {
    if (!p.open || !svc.length || !pro || !date) { setSlots(null); return }
    let alive = true
    setSlots(null)
    supabase.rpc('staff_available_slots', { p_business: p.businessId, p_service_ids: svc, p_professional_id: pro, p_date: date, p_exclude: null })
      .then(({ data }) => { if (alive) setSlots(((data ?? []) as { t: string; l?: number | null }[]).map((x) => ({ hm: hmInTz(x.t, p.tz), left: x.l ?? null }))) })
    return () => { alive = false }
  }, [p.open, svc, pro, date, p.businessId, p.tz])

  async function submit() {
    setError('')
    if (mode === 'search' && !client) return setError('Elegí un cliente o cargá uno nuevo')
    if (mode === 'new' && newClient.name.trim().length < 2) return setError('Ingresá el nombre del cliente')
    if (!svc.length) return setError('Elegí al menos un servicio')
    if (!pro) return setError('Elegí el profesional')
    if (!date || !/^\d{2}:\d{2}$/.test(time)) return setError('Elegí día y hora')
    setBusy(true)
    const { error } = await supabase.rpc('staff_create_appointment', {
      p_business: p.businessId,
      p_professional_id: pro,
      p_service_ids: svc,
      p_starts_at: zonedToIso(date, time, p.tz),
      p_client_id: mode === 'search' ? client!.id : null,
      p_client_name: mode === 'new' ? newClient.name.trim() : null,
      p_client_phone: mode === 'new' ? newClient.phone.trim() || null : null,
      p_notes: notes.trim() || null,
      p_quantities: svc.map((id) => qty[id] ?? 1),
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    p.onCreated()
    p.onClose()
  }

  return (
    <Modal open={p.open} onClose={p.onClose} title="Nuevo turno" wide
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-volt-muted">{svc.length > 0 && <>{units.length ? units.map((u) => qtyLabel(qOf(u), u.unit_label)).join(' + ') : fmtDuration(totalMin)} · <b className="text-volt-white">{ars(totalPrice)}</b></>}</div>
          <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Spinner /> : 'Agendar turno'}</button>
        </div>
      }>
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}

        {/* Cliente */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Cliente</span>
            <button type="button" className="text-xs font-semibold text-volt-violet2" onClick={() => { setMode(mode === 'search' ? 'new' : 'search'); setClient(null) }}>
              {mode === 'search' ? <span className="flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Cliente nuevo</span> : 'Buscar existente'}
            </button>
          </div>
          {mode === 'search' ? (
            client ? (
              <div className="flex items-center justify-between rounded-xl border border-volt-violet bg-volt-violet/10 px-3.5 py-3">
                <div><div className="font-semibold">{client.name}</div><div className="text-xs text-volt-muted">{client.phone ?? 'Sin teléfono'}</div></div>
                <button className="text-xs text-volt-muted underline" onClick={() => setClient(null)}>Cambiar</button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-volt-muted" />
                  <input className="input pl-10" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Nombre o teléfono" />
                </div>
                {hits.length > 0 && (
                  <ul className="mt-2 divide-y divide-volt-line rounded-xl border border-volt-line">
                    {hits.map((h) => (
                      <li key={h.id}><button className="w-full px-3.5 py-2.5 text-left hover:bg-white/5" onClick={() => setClient(h)}>
                        <span className="font-medium">{h.name}</span> <span className="text-xs text-volt-muted">{h.phone}</span>
                      </button></li>
                    ))}
                  </ul>
                )}
                {clientQuery.trim().length >= 2 && hits.length === 0 && (
                  <button className="mt-2 text-sm text-volt-violet2" onClick={() => { setMode('new'); setNewClient({ name: /\d/.test(clientQuery) ? '' : clientQuery, phone: /\d/.test(clientQuery) ? clientQuery : '' }) }}>
                    No existe. ¿Cargarlo como cliente nuevo?
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="input" placeholder="Nombre y apellido" maxLength={80} value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
              <input className="input" placeholder="WhatsApp (opcional)" type="tel" maxLength={30} value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
            </div>
          )}
        </section>

        {/* Servicios */}
        <section>
          <span className="label">Servicios</span>
          <div className="flex flex-wrap gap-2">
            {activeServices.map((s) => {
              const on = svc.includes(s.id)
              return (
                <button type="button" key={s.id} onClick={() => toggle(s)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${on ? 'border-volt-violet bg-volt-violet/15' : 'border-volt-line text-volt-muted hover:border-volt-violet/40'}`}>
                  {on && <Check className="h-3.5 w-3.5 text-volt-violet2" />}{s.name} <span className="text-xs opacity-70">{s.duration_min}′</span>
                </button>
              )
            })}
            {activeServices.length === 0 && <p className="text-sm text-volt-muted">Cargá servicios primero.</p>}
          </div>
          {units.map((u) => (
            <div key={u.id} className="mt-3 flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-volt-muted">{u.name} ({u.unit_label})</span>
              <input className="input w-24" inputMode="numeric" value={qOf(u)}
                onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setQty({ ...qty, [u.id]: Math.min(u.max_qty, Math.max(1, n || 1)) }) }} />
              <span className="text-xs text-volt-muted">máx. {u.max_qty}</span>
            </div>
          ))}
          {groupSvc && <p className="mt-2 text-xs text-volt-muted">Clase grupal: hasta {groupSvc.capacity} personas por horario.</p>}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profesional">
            <select className="input" value={pro} disabled={!!p.lockedProfessionalId} onChange={(e) => setPro(e.target.value)}>
              <option value="">Elegir…</option>
              {(p.lockedProfessionalId ? p.pros.filter((x) => x.id === p.lockedProfessionalId) : eligiblePros).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Día"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>

        <section>
          <span className="label">Hora</span>
          {svc.length > 0 && pro && (
            slots === null ? <div className="py-2"><Spinner className="h-4 w-4 text-volt-muted" /></div>
            : slots.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {slots.map((x) => (
                  <button key={x.hm} type="button" onClick={() => setTime(x.hm)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${time === x.hm ? 'border-volt-violet bg-volt-violet text-white' : 'border-volt-line hover:border-volt-violet/40'}`}>
                    {x.hm}{groupSvc && x.left != null && <span className="ml-1 text-[11px] opacity-75">({x.left} libres)</span>}
                  </button>
                ))}
              </div>
            ) : <p className="mb-2 text-xs text-volt-muted">No hay huecos dentro del horario laboral ese día. Podés cargar una hora a mano.</p>
          )}
          <input type="time" step={300} className="input max-w-[10rem]" value={time} onChange={(e) => setTime(e.target.value)} />
        </section>

        <Field label="Nota interna (opcional)"><input className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Trae su tintura" /></Field>
      </div>
    </Modal>
  )
}
