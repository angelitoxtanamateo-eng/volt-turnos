import { useCallback, useEffect, useState } from 'react'
import { Plus, UserRound, Pencil, Trash2, Copy, Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Empty, Field, PageHeader, Spinner } from '../../components/ui'
import Modal from '../../components/Modal'
import type { Professional, Service, WorkingHour } from '../../lib/types'
import { WEEKDAYS, WEEKDAYS_SHORT, hhmm } from '../../lib/time'

interface Draft {
  id?: string
  name: string
  specialty: string
  phone: string
  commission_pct: string
  is_active: boolean
  user_id: string | null
  services: string[]
  hours: WorkingHour[]
}
const DEFAULT_HOURS: WorkingHour[] = [1, 2, 3, 4, 5].flatMap((d) => [
  { weekday: d, start_time: '09:00', end_time: '13:00' },
  { weekday: d, start_time: '16:00', end_time: '20:00' },
]).concat([{ weekday: 6, start_time: '09:00', end_time: '13:00' }])

export default function Professionals() {
  const { user } = useAuth()
  const { current, plan } = useBusiness()
  const b = current!.business
  const [pros, setPros] = useState<Professional[] | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [hoursByPro, setHoursByPro] = useState<Record<string, WorkingHour[]>>({})
  const [svcByPro, setSvcByPro] = useState<Record<string, string[]>>({})
  const [members, setMembers] = useState<{ user_id: string; name: string }[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [tab, setTab] = useState<'datos' | 'servicios' | 'horarios'>('datos')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [p, s, h, ps, m] = await Promise.all([
      supabase.from('professionals').select('*').eq('business_id', b.id).order('sort_order').order('name'),
      supabase.from('services').select('*').eq('business_id', b.id).order('sort_order').order('name'),
      supabase.from('working_hours').select('professional_id, weekday, start_time, end_time').eq('business_id', b.id).order('start_time'),
      supabase.from('professional_services').select('professional_id, service_id').eq('business_id', b.id),
      supabase.from('business_members').select('user_id').eq('business_id', b.id),
    ])
    if (p.error) setError(errorMessage(p.error))
    setPros((p.data ?? []) as Professional[])
    setServices((s.data ?? []) as Service[])
    const hb: Record<string, WorkingHour[]> = {}
    for (const r of (h.data ?? []) as (WorkingHour & { professional_id: string })[]) {
      (hb[r.professional_id] ??= []).push({ weekday: r.weekday, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) })
    }
    setHoursByPro(hb)
    const sb: Record<string, string[]> = {}
    for (const r of (ps.data ?? []) as { professional_id: string; service_id: string }[]) (sb[r.professional_id] ??= []).push(r.service_id)
    setSvcByPro(sb)
    const ids = ((m.data ?? []) as { user_id: string }[]).map((x) => x.user_id)
    if (ids.length) {
      const { data: prof } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setMembers(((prof ?? []) as { id: string; full_name: string | null }[]).map((x) => ({ user_id: x.id, name: x.full_name ?? 'Sin nombre' })))
    }
  }, [b.id])
  useEffect(() => { load() }, [load])

  function openNew() {
    setError(''); setTab('datos')
    const me = pros?.some((p) => p.user_id === user!.id) ? null : user!.id
    setDraft({ name: pros?.length ? '' : (members.find((m) => m.user_id === user!.id)?.name ?? ''), specialty: '', phone: '', commission_pct: '0', is_active: true,
      user_id: pros?.length ? null : me, services: services.filter((s) => s.is_active).map((s) => s.id), hours: DEFAULT_HOURS })
  }
  function openEdit(p: Professional) {
    setError(''); setTab('datos')
    setDraft({ id: p.id, name: p.name, specialty: p.specialty ?? '', phone: p.phone ?? '', commission_pct: String(Number(p.commission_pct)), is_active: p.is_active,
      user_id: p.user_id, services: svcByPro[p.id] ?? [], hours: hoursByPro[p.id] ?? [] })
  }

  async function save() {
    if (!draft) return
    setError('')
    if (draft.name.trim().length < 2) { setTab('datos'); return setError('Poné el nombre del profesional') }
    const pct = Number(draft.commission_pct.replace(',', '.'))
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { setTab('datos'); return setError('La comisión va de 0 a 100%') }
    for (const h of draft.hours) {
      if (!h.start_time || !h.end_time || h.end_time <= h.start_time) { setTab('horarios'); return setError(`Revisá el horario del ${WEEKDAYS[h.weekday].toLowerCase()}: la salida debe ser después de la entrada`) }
    }
    setBusy(true)
    const row = { name: draft.name.trim(), specialty: draft.specialty.trim() || null, phone: draft.phone.trim() || null, commission_pct: pct, is_active: draft.is_active, user_id: draft.user_id }
    let id = draft.id
    if (id) {
      const { error } = await supabase.from('professionals').update(row).eq('id', id)
      if (error) { setBusy(false); return setError(errorMessage(error)) }
    } else {
      const { data, error } = await supabase.from('professionals').insert({ ...row, business_id: b.id, sort_order: (pros?.length ?? 0) + 1 }).select('id').single()
      if (error) { setBusy(false); return setError(errorMessage(error)) }
      id = (data as { id: string }).id
    }
    const d1 = await supabase.from('professional_services').delete().eq('professional_id', id)
    const i1 = draft.services.length
      ? await supabase.from('professional_services').insert(draft.services.map((sid) => ({ business_id: b.id, professional_id: id, service_id: sid })))
      : { error: null }
    const d2 = await supabase.from('working_hours').delete().eq('professional_id', id)
    const i2 = draft.hours.length
      ? await supabase.from('working_hours').insert(draft.hours.map((h) => ({ business_id: b.id, professional_id: id, weekday: h.weekday, start_time: h.start_time, end_time: h.end_time })))
      : { error: null }
    setBusy(false)
    const err = d1.error || i1.error || d2.error || i2.error
    if (err) return setError(errorMessage(err))
    setDraft(null)
    load()
  }

  async function remove(p: Professional) {
    if (!confirm(`¿Eliminar a ${p.name}? Si tiene turnos cargados, mejor desactivalo.`)) return
    const { error } = await supabase.from('professionals').delete().eq('id', p.id)
    if (error) return setError(error.code === '23503' ? 'Tiene turnos cargados: desactivalo en vez de eliminarlo.' : errorMessage(error))
    load()
  }

  const setHours = (hours: WorkingHour[]) => draft && setDraft({ ...draft, hours })
  const activeCount = pros?.filter((p) => p.is_active).length ?? 0
  const max = plan?.max_professionals ?? null

  return (
    <div>
      <PageHeader
        title="Profesionales"
        subtitle="Quién atiende, qué servicios hace y en qué horarios"
        action={
          <div className="flex items-center gap-2">
            {max !== null && <span className="chip bg-white/5 text-volt-muted">{activeCount}/{max} activos</span>}
            <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> Agregar</button>
          </div>
        }
      />
      {error && !draft && <div className="mb-4"><Alert>{error}</Alert></div>}
      {services.length === 0 && pros && (
        <div className="mb-4"><Alert>Primero cargá tus servicios en la sección Servicios, así se los podés asignar a cada profesional.</Alert></div>
      )}

      {!pros ? (
        <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
      ) : pros.length === 0 ? (
        <Empty icon={<UserRound className="h-6 w-6" />} title="Agregá quién atiende"
          text="Si trabajás solo, agregate a vos mismo. Cada profesional tiene su agenda y horarios."
          action={<button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> Agregar profesional</button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pros.map((p) => {
            const hrs = hoursByPro[p.id] ?? []
            const days = [...new Set(hrs.map((h) => h.weekday))].sort((a, c) => ((a + 6) % 7) - ((c + 6) % 7))
            return (
              <div key={p.id} className={`card p-4 animate-fade-up ${p.is_active ? '' : 'opacity-50'}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-volt-violet/15 text-lg font-bold text-volt-violet2">{p.name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      {!p.is_active && <span className="chip bg-white/5 text-volt-muted">Inactivo</span>}
                      {p.user_id && <span className="chip bg-volt-green/10 text-volt-green">Con acceso</span>}
                    </div>
                    <div className="text-xs text-volt-muted">{p.specialty || 'Sin especialidad'} · comisión {Number(p.commission_pct)}%</div>
                  </div>
                  <button className="rounded-lg p-2 text-volt-muted hover:bg-white/5 hover:text-volt-white" onClick={() => openEdit(p)} title="Editar"><Pencil className="h-4 w-4" /></button>
                  <button className="rounded-lg p-2 text-volt-muted hover:bg-volt-red/10 hover:text-volt-red" onClick={() => remove(p)} title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(svcByPro[p.id] ?? []).map((sid) => {
                    const s = services.find((x) => x.id === sid)
                    return s ? <span key={sid} className="chip bg-white/5 text-volt-muted">{s.name}</span> : null
                  })}
                  {(svcByPro[p.id] ?? []).length === 0 && <span className="text-xs text-volt-amber">Sin servicios asignados: no aparece en el turnero</span>}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-volt-muted">
                  <Clock className="h-3.5 w-3.5" />
                  {days.length ? days.map((d) => WEEKDAYS_SHORT[d]).join(' · ') : <span className="text-volt-amber">Sin horarios cargados</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Editar profesional' : 'Nuevo profesional'} wide
        footer={<button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Guardar'}</button>}>
        {draft && (
          <div className="space-y-4">
            <div className="flex gap-1 rounded-xl border border-volt-line bg-volt-bg p-1 text-sm">
              {(['datos', 'servicios', 'horarios'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-3 py-2 font-semibold capitalize transition ${tab === t ? 'bg-volt-violet text-white' : 'text-volt-muted'}`}>{t}</button>
              ))}
            </div>
            {error && <Alert>{error}</Alert>}

            {tab === 'datos' && (
              <div className="space-y-4">
                <Field label="Nombre"><input className="input" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Yor" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Especialidad (opcional)"><input className="input" maxLength={80} value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} placeholder="Colorista" /></Field>
                  <Field label="WhatsApp (opcional)"><input className="input" type="tel" maxLength={30} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
                </div>
                <Field label="Comisión (%)" hint="Se calcula en Caja sobre lo que cobra este profesional.">
                  <input className="input" inputMode="decimal" value={draft.commission_pct} onChange={(e) => setDraft({ ...draft, commission_pct: e.target.value })} />
                </Field>
                <Field label="Acceso al panel" hint="Vinculalo a un miembro del equipo para que vea y gestione su propia agenda.">
                  <select className="input" value={draft.user_id ?? ''} onChange={(e) => setDraft({ ...draft, user_id: e.target.value || null })}>
                    <option value="">Sin acceso (solo agenda)</option>
                    {members.filter((m) => m.user_id === draft.user_id || !pros?.some((p) => p.user_id === m.user_id)).map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.name}{m.user_id === user!.id ? ' (vos)' : ''}</option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-volt-violet" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                  Activo (recibe turnos)
                </label>
              </div>
            )}

            {tab === 'servicios' && (
              <div className="space-y-2">
                {services.length === 0 && <p className="text-sm text-volt-muted">No hay servicios cargados todavía.</p>}
                {services.map((s) => {
                  const on = draft.services.includes(s.id)
                  return (
                    <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition ${on ? 'border-volt-violet bg-volt-violet/10' : 'border-volt-line'}`}>
                      <input type="checkbox" className="h-5 w-5 accent-volt-violet" checked={on}
                        onChange={() => setDraft({ ...draft, services: on ? draft.services.filter((x) => x !== s.id) : [...draft.services, s.id] })} />
                      <span className="flex-1 font-medium">{s.name}</span>
                      {!s.is_active && <span className="text-xs text-volt-muted">oculto</span>}
                    </label>
                  )
                })}
              </div>
            )}

            {tab === 'horarios' && <HoursEditor hours={draft.hours} onChange={setHours} />}
          </div>
        )}
      </Modal>
    </div>
  )
}

function HoursEditor({ hours, onChange }: { hours: WorkingHour[]; onChange: (h: WorkingHour[]) => void }) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const byDay = (d: number) => hours.filter((h) => h.weekday === d)
  const update = (d: number, idx: number, patch: Partial<WorkingHour>) => {
    let i = -1
    onChange(hours.map((h) => (h.weekday === d && ++i === idx ? { ...h, ...patch } : h)))
  }
  const removeAt = (d: number, idx: number) => {
    let i = -1
    onChange(hours.filter((h) => !(h.weekday === d && ++i === idx)))
  }
  const copyToAll = (d: number) => {
    const src = byDay(d)
    onChange([...hours.filter((h) => h.weekday === d || h.weekday === 0), ...[1, 2, 3, 4, 5, 6].filter((x) => x !== d).flatMap((x) => src.map((h) => ({ ...h, weekday: x })))])
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-volt-muted">Podés cargar dos franjas por día para el descanso (ej. 9 a 13 y 16 a 20). Los días sin franjas no se trabaja.</p>
      {order.map((d) => {
        const list = byDay(d)
        return (
          <div key={d} className="rounded-xl border border-volt-line p-3">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${list.length ? '' : 'text-volt-muted'}`}>{WEEKDAYS[d]}</span>
              <div className="flex gap-1">
                {list.length > 0 && d !== 0 && (
                  <button type="button" onClick={() => copyToAll(d)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-volt-muted hover:bg-white/5 hover:text-volt-white" title="Copiar a lunes–sábado">
                    <Copy className="h-3.5 w-3.5" /> Copiar a todos
                  </button>
                )}
                <button type="button" onClick={() => onChange([...hours, { weekday: d, start_time: list.length ? '16:00' : '09:00', end_time: list.length ? '20:00' : '13:00' }])}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-volt-violet2 hover:bg-volt-violet/10">
                  <Plus className="h-3.5 w-3.5" /> Franja
                </button>
              </div>
            </div>
            {list.length === 0 ? (
              <div className="mt-1 text-xs text-volt-muted">No trabaja</div>
            ) : (
              <div className="mt-2 space-y-2">
                {list.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input type="time" step={900} className="input py-2" value={h.start_time} onChange={(e) => update(d, idx, { start_time: e.target.value })} />
                    <span className="text-volt-muted">a</span>
                    <input type="time" step={900} className="input py-2" value={h.end_time} onChange={(e) => update(d, idx, { end_time: e.target.value })} />
                    <button type="button" onClick={() => removeAt(d, idx)} className="rounded-lg p-2 text-volt-muted hover:bg-volt-red/10 hover:text-volt-red"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
