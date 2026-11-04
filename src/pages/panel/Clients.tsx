import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Contact, Download, MessageCircle, Phone, Star, Moon, Plus, Save, Trash2 } from 'lucide-react'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Empty, Field, PageHeader, Spinner } from '../../components/ui'
import Modal from '../../components/Modal'
import { APPT_STATUS, ars, fmtDate, servicesLabel, type Appointment, type ClientRow } from '../../lib/types'
import { hmInTz } from '../../lib/time'
import { waLink } from '../../lib/share'
import { Link } from 'react-router-dom'

type Filter = 'todos' | 'frecuentes' | 'inactivos' | 'nuevos'
const INACTIVE_DAYS = 60

export default function Clients() {
  const { current, can, plan } = useBusiness()
  const b = current!.business
  const manager = can('manage')
  const [rows, setRows] = useState<ClientRow[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [open, setOpen] = useState<ClientRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('clients_with_stats').select('*').eq('business_id', b.id).order('name')
    if (error) setError(errorMessage(error))
    setRows(((data ?? []) as ClientRow[]).map((r) => ({ ...r, visits: Number(r.visits), no_shows: Number(r.no_shows), total_spent: Number(r.total_spent) })))
  }, [b.id])
  useEffect(() => { load() }, [load])

  const now = Date.now()
  const filtered = useMemo(() => {
    let list = rows ?? []
    const s = q.trim().toLowerCase()
    if (s) {
      const digits = s.replace(/\D/g, '')
      list = list.filter((r) => r.name.toLowerCase().includes(s) || (digits.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(digits)))
    }
    if (filter === 'frecuentes') list = list.filter((r) => r.visits >= 3).sort((a, c) => c.visits - a.visits)
    if (filter === 'inactivos') list = list.filter((r) => r.visits > 0 && !r.next_visit && r.last_visit && now - new Date(r.last_visit).getTime() > INACTIVE_DAYS * 86400000)
    if (filter === 'nuevos') list = list.filter((r) => now - new Date(r.created_at).getTime() < 30 * 86400000)
    return list
  }, [rows, q, filter, now])

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Nombre', 'Teléfono', 'Email', 'Visitas', 'Ausencias', 'Última visita', 'Próximo turno', 'Total gastado', 'Notas']
    const lines = filtered.map((r) => [r.name, r.phone, r.email, r.visits, r.no_shows, r.last_visit ? fmtDate(r.last_visit) : '', r.next_visit ? fmtDate(r.next_visit) : '', r.total_spent, r.notes].map(esc).join(';'))
    const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `clientes-${b.slug}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (plan && !plan.features?.crm) {
    return (
      <div>
        <PageHeader title="Clientes" />
        <Empty icon={<Contact className="h-6 w-6" />} title="El CRM de clientes está en el plan Pro"
          text="Historial de cada cliente, total gastado, frecuentes, inactivos y notas privadas."
          action={manager ? <Link to="/panel/plan" className="btn-primary">Ver planes</Link> : undefined} />
      </div>
    )
  }

  const winback = (r: ClientRow) => `¡Hola ${r.name.split(' ')[0]}! Hace mucho que no te vemos por ${b.name} 💈 ¿Te reservamos un turno? Podés sacarlo acá: ${window.location.origin}/${b.slug}`

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={rows ? `${rows.length} clientes en total` : undefined}
        action={
          <div className="flex gap-2">
            {manager && <button className="btn-ghost py-2.5 text-sm" onClick={exportCsv} disabled={!filtered.length}><Download className="h-4 w-4" /> Exportar</button>}
            {manager && <button className="btn-primary py-2.5 text-sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Cliente</button>}
          </div>
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-volt-muted" />
          <input className="input pl-10" placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([['todos', 'Todos', null], ['frecuentes', 'Frecuentes', <Star key="s" className="h-3.5 w-3.5" />], ['inactivos', `Inactivos +${INACTIVE_DAYS} días`, <Moon key="m" className="h-3.5 w-3.5" />], ['nuevos', 'Nuevos del mes', null]] as const).map(([k, label, icon]) => (
            <button key={k} onClick={() => setFilter(k)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium ${filter === k ? 'border-volt-violet bg-volt-violet/15 text-volt-white' : 'border-volt-line text-volt-muted'}`}>
              {icon}{label}
            </button>
          ))}
        </div>
      </div>

      {!rows ? (
        <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
      ) : filtered.length === 0 ? (
        <Empty icon={<Contact className="h-6 w-6" />} title={rows.length ? 'Nadie coincide con el filtro' : 'Todavía no hay clientes'}
          text={rows.length ? undefined : 'Se cargan solos cuando reservan online o cuando agendás un turno.'} />
      ) : (
        <div className="card divide-y divide-volt-line">
          {filtered.map((r) => {
            const inactive = r.last_visit && !r.next_visit && now - new Date(r.last_visit).getTime() > INACTIVE_DAYS * 86400000
            return (
              <button key={r.id} onClick={() => setOpen(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.03]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-volt-violet/15 font-bold text-volt-violet2">{r.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    {r.visits >= 3 && <Star className="h-3.5 w-3.5 shrink-0 fill-volt-amber text-volt-amber" />}
                  </div>
                  <div className="truncate text-xs text-volt-muted">
                    {r.visits} {r.visits === 1 ? 'visita' : 'visitas'}
                    {r.last_visit && ` · última ${fmtDate(r.last_visit)}`}
                    {r.next_visit && <span className="text-volt-violet2"> · próximo {fmtDate(r.next_visit)}</span>}
                    {inactive && <span className="text-volt-amber"> · inactivo</span>}
                  </div>
                </div>
                {manager && <span className="shrink-0 text-sm font-semibold">{ars(r.total_spent)}</span>}
                {filter === 'inactivos' && r.phone && (
                  <a href={waLink(winback(r), r.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-lg p-2 text-[#25D366] hover:bg-white/5" title="Invitar a volver">
                    <MessageCircle className="h-4 w-4" />
                  </a>
                )}
              </button>
            )
          })}
        </div>
      )}

      <ClientDetail client={open} onClose={() => setOpen(null)} onChanged={load} manager={manager} tz={b.timezone} />
      <NewClient open={creating} onClose={() => setCreating(false)} onCreated={load} businessId={b.id} />
    </div>
  )
}

function ClientDetail({ client, onClose, onChanged, manager, tz }: { client: ClientRow | null; onClose: () => void; onChanged: () => void; manager: boolean; tz: string }) {
  const [history, setHistory] = useState<Appointment[] | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!client) return
    setForm({ name: client.name, phone: client.phone ?? '', email: client.email ?? '', notes: client.notes ?? '' })
    setError(''); setSaved(false); setHistory(null)
    supabase.from('appointments')
      .select('*, clients(id, name, phone), appointment_services(service_id, name, duration_min, price_ars, position)')
      .eq('client_id', client.id).order('starts_at', { ascending: false }).limit(50)
      .then(({ data }) => setHistory((data ?? []) as Appointment[]))
  }, [client])

  if (!client) return null

  async function save() {
    setError(''); setSaved(false)
    if (form.name.trim().length < 2) return setError('El nombre es obligatorio')
    setBusy(true)
    const { error } = await supabase.from('clients').update({
      name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, notes: form.notes.trim() || null,
    }).eq('id', client!.id)
    setBusy(false)
    if (error) return setError(error.code === '23505' ? 'Ya hay otro cliente con ese teléfono' : errorMessage(error))
    setSaved(true); onChanged()
  }

  async function remove() {
    if (!confirm(`¿Eliminar a ${client!.name}? Solo se puede si no tiene turnos.`)) return
    const { error } = await supabase.from('clients').delete().eq('id', client!.id)
    if (error) return setError(error.code === '23503' ? 'Tiene turnos registrados, no se puede eliminar.' : errorMessage(error))
    onChanged(); onClose()
  }

  const completed = (history ?? []).filter((a) => a.status === 'completed')
  const avgGap = completed.length >= 2
    ? Math.round((new Date(completed[0].starts_at).getTime() - new Date(completed[completed.length - 1].starts_at).getTime()) / 86400000 / (completed.length - 1))
    : null

  return (
    <Modal open onClose={onClose} title={client.name} wide>
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        {saved && <Alert kind="success">Guardado</Alert>}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-volt-line p-3"><div className="text-xl font-bold">{client.visits}</div><div className="text-[11px] text-volt-muted">Visitas</div></div>
          <div className="rounded-xl border border-volt-line p-3"><div className="text-xl font-bold">{manager ? ars(client.total_spent) : '—'}</div><div className="text-[11px] text-volt-muted">Gastado</div></div>
          <div className="rounded-xl border border-volt-line p-3"><div className="text-xl font-bold">{avgGap ? `${avgGap} d` : '—'}</div><div className="text-[11px] text-volt-muted">Viene cada</div></div>
        </div>

        {client.phone && (
          <div className="grid grid-cols-2 gap-2">
            <a className="btn-ghost text-sm" href={waLink(`Hola ${client.name.split(' ')[0]}!`, client.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 text-[#25D366]" /> WhatsApp</a>
            <a className="btn-ghost text-sm" href={`tel:${client.phone}`}><Phone className="h-4 w-4" /> Llamar</a>
          </div>
        )}

        {manager ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre"><input className="input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Teléfono"><input className="input" type="tel" value={form.phone} maxLength={30} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            </div>
            <Field label="Notas privadas" hint="Solo las ve tu equipo. Ej: alergias, fórmula de color, preferencias.">
              <textarea className="input min-h-[80px]" maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <button className="btn-ghost text-volt-muted hover:text-volt-red" onClick={remove}><Trash2 className="h-4 w-4" /></button>
              <button className="btn-primary flex-1" onClick={save} disabled={busy}>{busy ? <Spinner /> : <><Save className="h-4 w-4" /> Guardar</>}</button>
            </div>
          </div>
        ) : client.notes ? (
          <div className="rounded-xl bg-white/5 p-3 text-sm text-volt-muted">📝 {client.notes}</div>
        ) : null}

        <div>
          <h3 className="mb-2 text-sm font-semibold">Historial</h3>
          {!history ? <Spinner className="h-4 w-4 text-volt-muted" /> : history.length === 0 ? <p className="text-sm text-volt-muted">Sin turnos.</p> : (
            <ul className="divide-y divide-volt-line rounded-xl border border-volt-line">
              {history.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${APPT_STATUS[a.status].dot}`} />
                  <span className="w-24 shrink-0 text-xs text-volt-muted">{fmtDate(a.starts_at)}<br />{hmInTz(a.starts_at, tz)}</span>
                  <span className="min-w-0 flex-1 truncate">{servicesLabel(a)}</span>
                  <span className={`chip ${APPT_STATUS[a.status].cls}`}>{APPT_STATUS[a.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

function NewClient({ open, onClose, onCreated, businessId }: { open: boolean; onClose: () => void; onCreated: () => void; businessId: string }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ name: '', phone: '', email: '', notes: '' }); setError('') } }, [open])
  async function save() {
    setError('')
    if (f.name.trim().length < 2) return setError('Ingresá el nombre')
    setBusy(true)
    const { error } = await supabase.from('clients').insert({ business_id: businessId, name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, notes: f.notes.trim() || null })
    setBusy(false)
    if (error) return setError(error.code === '23505' ? 'Ya existe un cliente con ese teléfono' : errorMessage(error))
    onCreated(); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Nuevo cliente" footer={<button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Guardar'}</button>}>
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Field label="Nombre y apellido"><input className="input" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="WhatsApp"><input className="input" type="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email (opcional)"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Notas privadas"><textarea className="input" maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
