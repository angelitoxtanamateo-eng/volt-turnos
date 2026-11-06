import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Ban, Trash2, Globe, Users } from 'lucide-react'
import { useBusiness } from '../../../context/BusinessContext'
import { supabase, errorMessage } from '../../../lib/supabase'
import { useCatalog } from '../../../lib/useCatalog'
import { Alert, Spinner } from '../../../components/ui'
import Modal from '../../../components/Modal'
import { APPT_STATUS, servicesLabel, type Appointment, type TimeOff } from '../../../lib/types'
import {
  WEEKDAYS_SHORT, addDays, addMonths, daysInMonth, dayRangeIso, hmInTz, longDate, minutesInTz, monthLabel, shortDate,
  startOfMonth, startOfWeek, todayInTz, weekdayOf, ymdInTz,
} from '../../../lib/time'
import NewAppointment from './NewAppointment'
import AppointmentDetail from './AppointmentDetail'
import BlockTime from './BlockTime'

type View = 'dia' | 'semana' | 'mes'

/** Une a los anotados de una misma clase en un solo bloque */
type Item = { key: string; first: Appointment; all: Appointment[]; group: boolean }
function collapse(list: Appointment[]): Item[] {
  const out: Item[] = []
  const byKey = new Map<string, Item>()
  for (const a of list) {
    if (!a.group_service_id) { out.push({ key: a.id, first: a, all: [a], group: false }); continue }
    const k = `${a.professional_id}|${a.session_key}`
    const it = byKey.get(k)
    if (it) it.all.push(a)
    else { const n = { key: k, first: a, all: [a], group: true }; byKey.set(k, n); out.push(n) }
  }
  for (const it of out) {
    if (!it.group) continue
    const act = it.all.filter((a) => a.status !== 'cancelled')
    it.first = act[0] ?? it.all[0]
  }
  return out
}
const activeCount = (it: Item) => it.all.filter((a) => a.status !== 'cancelled').length
/** Pedidos por unidad: comparten el horario aunque lleven productos distintos */
const isOrderGroup = (a: Appointment) => !!a.group_service_id && a.group_service_id === a.business_id
const groupTitle = (a: Appointment) => (isOrderGroup(a) ? 'Pedidos' : servicesLabel(a))
const groupCount = (n: number, a: Appointment) => (isOrderGroup(a) ? `${n} ${n === 1 ? 'pedido' : 'pedidos'}` : `${n} anotados`)
const PX = 1.4 // píxeles por minuto en la vista diaria

export default function Agenda() {
  const { current, can, plan } = useBusiness()
  const b = current!.business
  const tz = b.timezone
  const isManager = can('manage')
  const { services, pros, proServices, loaded } = useCatalog(b.id)
  const [myPro, setMyPro] = useState<string | null | undefined>(isManager ? null : undefined)

  const [view, setView] = useState<View>('dia')
  const [date, setDate] = useState(() => todayInTz(tz))
  const [proFilter, setProFilter] = useState<string>('all')
  const [appts, setAppts] = useState<Appointment[] | null>(null)
  const [blocks, setBlocks] = useState<TimeOff[]>([])
  const [hours, setHours] = useState<{ professional_id: string; weekday: number; start_time: string; end_time: string }[]>([])
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [groupSel, setGroupSel] = useState<Appointment[] | null>(null)
  const [creating, setCreating] = useState<{ date?: string; time?: string; professionalId?: string } | null>(null)
  const [blocking, setBlocking] = useState(false)

  // Un profesional solo ve su propia agenda
  useEffect(() => {
    if (isManager) return
    supabase.rpc('my_professional_id', { p_business: b.id }).then(({ data }) => setMyPro((data as string) ?? null))
  }, [b.id, isManager])

  const range = useMemo((): [string, string] => {
    if (view === 'dia') return [date, addDays(date, 1)]
    if (view === 'semana') { const s = startOfWeek(date); return [s, addDays(s, 7)] }
    const s = startOfMonth(date); return [s, addDays(s, daysInMonth(date))]
  }, [view, date])

  const load = useCallback(async () => {
    const [from, to] = dayRangeIso(range[0], range[1], tz)
    const [a, t, h] = await Promise.all([
      supabase.from('appointments')
        .select('*, clients(id, name, phone), appointment_services(service_id, name, duration_min, price_ars, position, quantity, unit_label)')
        .eq('business_id', b.id).gte('starts_at', from).lt('starts_at', to).order('starts_at'),
      supabase.from('time_off').select('id, professional_id, starts_at, ends_at, reason').eq('business_id', b.id).lt('starts_at', to).gt('ends_at', from),
      supabase.from('working_hours').select('professional_id, weekday, start_time, end_time').eq('business_id', b.id),
    ])
    if (a.error) setError(errorMessage(a.error))
    setAppts((a.data ?? []) as Appointment[])
    setBlocks((t.data ?? []) as TimeOff[])
    setHours((h.data ?? []) as typeof hours)
  }, [b.id, range, tz])
  useEffect(() => { load() }, [load])

  // Refresco en vivo cuando entra una reserva online
  useEffect(() => {
    const ch = supabase.channel(`agenda-${b.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${b.id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [b.id, load])

  const lockedPro = isManager ? null : myPro ?? null
  const visiblePros = useMemo(() => {
    let list = pros.filter((p) => p.is_active || appts?.some((a) => a.professional_id === p.id))
    if (lockedPro) list = list.filter((p) => p.id === lockedPro)
    else if (proFilter !== 'all') list = list.filter((p) => p.id === proFilter)
    return list
  }, [pros, appts, proFilter, lockedPro])
  const visibleIds = new Set(visiblePros.map((p) => p.id))
  const shown = (appts ?? []).filter((a) => visibleIds.has(a.professional_id))
  const capOf = (a: Appointment) => {
    if (isOrderGroup(a)) {
      const caps = services.filter((x) => x.unit_label && x.is_active).map((x) => x.capacity)
      return caps.length ? Math.min(...caps) : null
    }
    return services.find((x) => x.id === a.group_service_id)?.capacity ?? null
  }
  const pick = (it: Item) => (it.group ? setGroupSel(it.all) : setSelected(it.first))
  // Mantiene la lista de la clase al día cuando cambia algo
  useEffect(() => {
    if (!groupSel || !appts) return
    const k = groupSel[0]?.session_key
    const fresh = appts.filter((a) => a.session_key === k && a.professional_id === groupSel[0].professional_id)
    if (fresh.length !== groupSel.length || fresh.some((a, i) => a.status !== groupSel[i]?.status)) setGroupSel(fresh.length ? fresh : null)
  }, [appts]) // eslint-disable-line react-hooks/exhaustive-deps

  function shift(n: number) {
    if (view === 'dia') setDate(addDays(date, n))
    else if (view === 'semana') setDate(addDays(date, 7 * n))
    else setDate(addMonths(date, n))
  }

  const title = view === 'dia' ? longDate(date) : view === 'semana' ? `Semana del ${Number(range[0].slice(8))} al ${shortDate(addDays(range[1], -1))}` : monthLabel(date)
  const isToday = date === todayInTz(tz)

  async function removeBlock(id: string) {
    if (!confirm('¿Quitar este bloqueo?')) return
    const { error } = await supabase.from('time_off').delete().eq('id', id)
    if (error) return setError(errorMessage(error))
    load()
  }

  if (!isManager && myPro === undefined) return <div className="grid place-items-center py-16"><Spinner className="text-volt-violet" /></div>
  if (!isManager && myPro === null) {
    return <div className="card p-8 text-center text-sm text-volt-muted">Tu usuario todavía no está vinculado a un profesional. Pedile al dueño que te vincule desde Profesionales.</div>
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2.5 py-2" onClick={() => shift(-1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button className={`btn-ghost px-3 py-2 text-sm ${isToday && view === 'dia' ? 'border-volt-violet text-volt-violet2' : ''}`} onClick={() => setDate(todayInTz(tz))}>Hoy</button>
          <button className="btn-ghost px-2.5 py-2" onClick={() => shift(1)} aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold capitalize sm:text-xl">{title}</h1>
        <div className="flex gap-1 rounded-xl border border-volt-line bg-volt-card p-1 text-sm">
          {(['dia', 'semana', 'mes'] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 font-semibold capitalize ${view === v ? 'bg-volt-violet text-white' : 'text-volt-muted'}`}>{v === 'dia' ? 'Día' : v}</button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!lockedPro && pros.length > 1 && (
          <select className="input w-auto py-2 text-sm" value={proFilter} onChange={(e) => setProFilter(e.target.value)}>
            <option value="all">Todos los profesionales</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input type="date" className="input w-auto py-2 text-sm" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <div className="flex-1" />
        <button className="btn-ghost py-2 text-sm" onClick={() => setBlocking(true)}><Ban className="h-4 w-4" /> Bloquear</button>
        <button className="btn-primary py-2 text-sm" onClick={() => setCreating({ date })} disabled={!services.length || !pros.length}><Plus className="h-4 w-4" /> Turno</button>
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {loaded && (!services.length || !pros.length) ? (
        <div className="card p-6 text-sm text-volt-muted">
          Para usar la agenda primero cargá {!services.length && <Link to="/panel/servicios" className="font-semibold text-volt-violet2">tus servicios</Link>}
          {!services.length && !pros.length && ' y '}
          {!pros.length && <Link to="/panel/profesionales" className="font-semibold text-volt-violet2">tus profesionales con sus horarios</Link>}.
        </div>
      ) : !appts ? (
        <div className="grid place-items-center py-16"><Spinner className="text-volt-violet" /></div>
      ) : view === 'dia' ? (
        <DayGrid
          date={date} tz={tz} pros={visiblePros} appts={shown} blocks={blocks} hours={hours} isToday={isToday}
          onSelect={pick} capOf={capOf} onRemoveBlock={removeBlock}
          onEmpty={(proId, time) => setCreating({ date, time, professionalId: proId })}
        />
      ) : view === 'semana' ? (
        <WeekList start={range[0]} tz={tz} appts={shown} blocks={blocks} pros={visiblePros} onSelect={pick} capOf={capOf} onDay={(d) => { setDate(d); setView('dia') }} />
      ) : (
        <MonthGrid month={date} tz={tz} appts={shown} onDay={(d) => { setDate(d); setView('dia') }} />
      )}

      <NewAppointment
        open={!!creating} onClose={() => setCreating(null)} onCreated={load}
        businessId={b.id} tz={tz} services={services} pros={pros} proServices={proServices}
        defaults={creating ?? undefined} lockedProfessionalId={lockedPro}
      />
      <AppointmentDetail
        appt={selected} onClose={() => setSelected(null)} onChanged={load} tz={tz} businessName={b.name}
        address={[b.address, b.city].filter(Boolean).join(', ') || null} pros={pros}
        canCharge={isManager || Boolean(plan?.features?.cash)}
      />
      <Modal open={!!groupSel} onClose={() => setGroupSel(null)}
        title={groupSel?.[0] ? `${groupTitle(groupSel[0])} · ${hmInTz(groupSel[0].starts_at, tz)}` : 'Clase'}
        footer={groupSel?.[0] && groupSel.filter((a) => a.status !== 'cancelled').length < (capOf(groupSel[0]) ?? Infinity) ? (
          <button className="btn-primary w-full" onClick={() => {
            const a = groupSel![0]
            setGroupSel(null)
            setCreating({ date: ymdInTz(a.starts_at, tz), time: hmInTz(a.starts_at, tz), professionalId: a.professional_id })
          }}><Plus className="h-4 w-4" /> {isOrderGroup(groupSel![0]) ? 'Cargar otro pedido' : 'Anotar a alguien más'}</button>
        ) : undefined}>
        {groupSel && (
          <div>
            <p className="mb-3 text-sm text-volt-muted">
              <b className="text-volt-white">{groupSel.filter((a) => a.status !== 'cancelled').length}</b>
              {capOf(groupSel[0]) ? ` de ${capOf(groupSel[0])} ${isOrderGroup(groupSel[0]) ? 'pedidos posibles' : 'lugares ocupados'}` : ' anotados'} · {pros.find((x) => x.id === groupSel[0].professional_id)?.name}
            </p>
            <ul className="divide-y divide-volt-line rounded-xl border border-volt-line">
              {groupSel.map((a) => (
                <li key={a.id}>
                  <button className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-white/5" onClick={() => { setGroupSel(null); setSelected(a) }}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${APPT_STATUS[a.status].dot}`} />
                    <span className={`min-w-0 flex-1 ${a.status === 'cancelled' ? 'text-volt-muted line-through' : ''}`}>
                      <span className="block truncate font-medium">{a.clients?.name}</span>
                      {isOrderGroup(a) && <span className="block truncate text-xs text-volt-muted">{servicesLabel(a)}</span>}
                    </span>
                    {a.source === 'online' && <Globe className="h-3.5 w-3.5 text-volt-muted" />}
                    <span className="text-xs text-volt-muted">{APPT_STATUS[a.status].label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
      <BlockTime
        open={blocking} onClose={() => setBlocking(false)} onCreated={load} businessId={b.id} tz={tz} pros={pros}
        defaultDate={date} lockedProfessionalId={lockedPro} canBlockAll={isManager}
      />
    </div>
  )
}

/* ---------------- Vista diaria: grilla por profesional ---------------- */
function DayGrid({ date, tz, pros, appts, blocks, hours, isToday, onSelect, capOf, onEmpty, onRemoveBlock }: {
  date: string; tz: string; pros: { id: string; name: string }[]; appts: Appointment[]; blocks: TimeOff[]
  hours: { professional_id: string; weekday: number; start_time: string; end_time: string }[]; isToday: boolean
  onSelect: (it: Item) => void; capOf: (a: Appointment) => number | null; onEmpty: (proId: string, time: string) => void; onRemoveBlock: (id: string) => void
}) {
  const wd = weekdayOf(date)
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const dayHours = hours.filter((h) => h.weekday === wd && pros.some((p) => p.id === h.professional_id))
  let startMin = Math.min(8 * 60, ...dayHours.map((h) => toMin(h.start_time)), ...appts.map((a) => minutesInTz(a.starts_at, tz)))
  let endMin = Math.max(20 * 60, ...dayHours.map((h) => toMin(h.end_time)), ...appts.map((a) => minutesInTz(a.ends_at, tz) || 24 * 60))
  startMin = Math.floor(startMin / 60) * 60
  endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60)
  const height = (endMin - startMin) * PX
  const nowMin = isToday ? minutesInTz(new Date(), tz) : -1

  // Bloqueo recortado al día visible
  const clip = (iso: string, isEnd: boolean) => {
    const ymd = ymdInTz(iso, tz)
    if (ymd < date) return startMin
    if (ymd > date) return endMin
    const m = minutesInTz(iso, tz)
    return isEnd && m === 0 ? endMin : m
  }

  if (!pros.length) return <div className="card p-6 text-sm text-volt-muted">No hay profesionales para mostrar.</div>

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="flex min-w-full" style={{ minWidth: 56 + pros.length * 150 }}>
          {/* Eje de horas */}
          <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-volt-line bg-volt-card">
            <div className="h-11 border-b border-volt-line" />
            <div className="relative" style={{ height }}>
              {Array.from({ length: (endMin - startMin) / 60 }, (_, i) => (
                <div key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-volt-muted" style={{ top: i * 60 * PX }}>
                  {i === 0 ? '' : `${String((startMin / 60 + i) % 24).padStart(2, '0')}:00`}
                </div>
              ))}
            </div>
          </div>

          {pros.map((p) => {
            const ph = dayHours.filter((h) => h.professional_id === p.id)
            const pa = collapse(appts.filter((a) => a.professional_id === p.id))
            const pb = blocks.filter((x) => x.professional_id === null || x.professional_id === p.id)
            return (
              <div key={p.id} className="min-w-[150px] flex-1 border-r border-volt-line last:border-r-0">
                <div className="flex h-11 items-center justify-center border-b border-volt-line px-2 text-sm font-semibold"><span className="truncate">{p.name}</span></div>
                <div
                  className="relative cursor-pointer bg-black/20"
                  style={{ height }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return
                    const y = e.nativeEvent.offsetY
                    const m = startMin + Math.floor(y / PX / 15) * 15
                    onEmpty(p.id, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
                  }}
                >
                  {/* Horario laboral */}
                  {ph.map((h, i) => (
                    <div key={i} className="pointer-events-none absolute inset-x-0 bg-volt-card" style={{ top: (toMin(h.start_time) - startMin) * PX, height: (toMin(h.end_time) - toMin(h.start_time)) * PX }} />
                  ))}
                  {/* Líneas de hora */}
                  {Array.from({ length: (endMin - startMin) / 60 }, (_, i) => (
                    <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-volt-line/60" style={{ top: i * 60 * PX }} />
                  ))}
                  {/* Bloqueos */}
                  {pb.map((x) => {
                    const s = clip(x.starts_at, false), en = clip(x.ends_at, true)
                    if (en <= s) return null
                    return (
                      <div key={x.id} className="absolute inset-x-1 overflow-hidden rounded-lg border border-dashed border-volt-muted/40 bg-[repeating-linear-gradient(45deg,rgba(148,163,184,.08)_0,rgba(148,163,184,.08)_6px,transparent_6px,transparent_12px)] px-2 py-1 text-[11px] text-volt-muted"
                        style={{ top: (s - startMin) * PX, height: Math.max((en - s) * PX, 18) }}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="truncate">🚫 {x.reason || 'Bloqueado'}</span>
                          <button className="shrink-0 hover:text-volt-red" onClick={() => onRemoveBlock(x.id)} aria-label="Quitar bloqueo"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    )
                  })}
                  {/* Turnos */}
                  {pa.map((it) => {
                    const a = it.first
                    const s = minutesInTz(a.starts_at, tz)
                    const en = ymdInTz(a.ends_at, tz) > date ? endMin : minutesInTz(a.ends_at, tz)
                    const st = APPT_STATUS[a.status]
                    const h = Math.max((en - s) * PX, 26)
                    if (it.group) {
                      const n = activeCount(it), cap = capOf(a)
                      const done = n > 0 && it.all.filter((x) => x.status !== 'cancelled').every((x) => x.status === 'completed')
                      return (
                        <button key={it.key} onClick={() => onSelect(it)}
                          className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left text-xs shadow-sm transition hover:brightness-110 ${n === 0 ? 'border-volt-muted bg-white/5 text-volt-muted opacity-60' : done ? 'border-volt-green bg-volt-green/15' : 'border-volt-violet bg-volt-violet/25'}`}
                          style={{ top: (s - startMin) * PX, height: h }}>
                          <div className="flex items-center gap-1 font-semibold">
                            <span>{hmInTz(a.starts_at, tz)}</span>
                            <span className="truncate">{groupTitle(a)}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-90"><Users className="h-3 w-3" /> {groupCount(n, a)}{cap ? ` de ${cap}` : ''}</div>
                        </button>
                      )
                    }
                    return (
                      <button key={a.id} onClick={() => onSelect(it)}
                        className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left text-xs shadow-sm transition hover:brightness-110 ${
                          a.status === 'cancelled' ? 'border-volt-muted bg-white/5 text-volt-muted opacity-60' : a.status === 'completed' ? 'border-volt-green bg-volt-green/15' : a.status === 'no_show' ? 'border-volt-amber bg-volt-amber/15' : 'border-volt-violet bg-volt-violet/25'
                        }`}
                        style={{ top: (s - startMin) * PX, height: h }} title={st.label}>
                        <div className="flex items-center gap-1 font-semibold">
                          <span>{hmInTz(a.starts_at, tz)}</span>
                          <span className={`truncate ${a.status === 'cancelled' ? 'line-through' : ''}`}>{a.clients?.name}</span>
                          {a.source === 'online' && <Globe className="h-3 w-3 shrink-0 opacity-70" />}
                        </div>
                        {h > 34 && <div className="truncate opacity-80">{servicesLabel(a)}</div>}
                      </button>
                    )
                  })}
                  {/* Ahora */}
                  {nowMin >= startMin && nowMin <= endMin && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-volt-red" style={{ top: (nowMin - startMin) * PX }}>
                      <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-volt-red" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-volt-line px-4 py-2.5 text-[11px] text-volt-muted">
        {Object.entries(APPT_STATUS).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${v.dot}`} />{v.label}</span>)}
        <span className="ml-auto hidden sm:inline">Tocá un espacio vacío para agendar</span>
      </div>
    </div>
  )
}

/* ---------------- Vista semanal ---------------- */
function WeekList({ start, tz, appts, blocks, pros, onSelect, capOf, onDay }: {
  start: string; tz: string; appts: Appointment[]; blocks: TimeOff[]; pros: { id: string; name: string }[]
  onSelect: (it: Item) => void; capOf: (a: Appointment) => number | null; onDay: (d: string) => void
}) {
  const today = todayInTz(tz)
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i)
        const list = collapse(appts.filter((a) => ymdInTz(a.starts_at, tz) === d))
        const hasBlock = blocks.some((x) => ymdInTz(x.starts_at, tz) <= d && ymdInTz(x.ends_at, tz) >= d)
        const active = list.reduce((n, it) => n + activeCount(it), 0)
        return (
          <div key={d} className={`card flex flex-col p-3 ${d === today ? 'border-volt-violet' : ''}`}>
            <button onClick={() => onDay(d)} className="mb-2 flex items-center justify-between text-left">
              <span className={`text-sm font-bold ${d === today ? 'text-volt-violet2' : ''}`}>{shortDate(d)}</span>
              <span className="flex items-center gap-1.5 text-xs text-volt-muted">{hasBlock && '🚫'}{active > 0 && <span className="chip bg-volt-violet/15 text-volt-violet2">{active}</span>}</span>
            </button>
            <div className="space-y-1.5">
              {list.length === 0 && <div className="py-2 text-xs text-volt-muted">Sin turnos</div>}
              {list.map(({ first: a, ...it }) => (
                <button key={it.key} onClick={() => onSelect({ first: a, ...it })} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5 ${(it.group ? activeCount({ first: a, ...it }) === 0 : a.status === 'cancelled') ? 'opacity-50 line-through' : ''}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${APPT_STATUS[a.status].dot}`} />
                  <span className="font-semibold">{hmInTz(a.starts_at, tz)}</span>
                  <span className="truncate">{it.group ? `${groupTitle(a)} · ${groupCount(activeCount({ first: a, ...it }), a)}` : a.clients?.name}</span>
                  {pros.length > 1 && <span className="ml-auto shrink-0 text-volt-muted">{pros.find((p) => p.id === a.professional_id)?.name.split(' ')[0]}</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Vista mensual ---------------- */
function MonthGrid({ month, tz, appts, onDay }: { month: string; tz: string; appts: Appointment[]; onDay: (d: string) => void }) {
  const first = startOfMonth(month)
  const lead = (weekdayOf(first) + 6) % 7 // lunes primero
  const n = daysInMonth(month)
  const today = todayInTz(tz)
  const counts: Record<string, { n: number; done: number }> = {}
  for (const a of appts) {
    if (a.status === 'cancelled') continue
    const d = ymdInTz(a.starts_at, tz)
    counts[d] ??= { n: 0, done: 0 }
    counts[d].n++
    if (a.status === 'completed') counts[d].done++
  }
  return (
    <div className="card p-3">
      <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-volt-muted">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => <div key={d}>{WEEKDAYS_SHORT[d]}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: n }, (_, i) => {
          const d = addDays(first, i)
          const c = counts[d]
          return (
            <button key={d} onClick={() => onDay(d)}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition hover:border-volt-violet/50 sm:aspect-auto sm:h-20 ${d === today ? 'border-volt-violet bg-volt-violet/10' : 'border-volt-line'}`}>
              <span className={`font-semibold ${d < today ? 'text-volt-muted' : ''}`}>{i + 1}</span>
              {c && <span className="mt-0.5 rounded-full bg-volt-violet/20 px-1.5 text-[10px] font-bold text-volt-violet2">{c.n}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
