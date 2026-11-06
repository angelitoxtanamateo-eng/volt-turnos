import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Scissors, Clock, Pencil, Eye, EyeOff, Users, Package } from 'lucide-react'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Empty, Field, PageHeader, Spinner } from '../../components/ui'
import Modal from '../../components/Modal'
import { kindsFor, modulesOf, priceLabel, termsFor, type Service, type ServiceKind } from '../../lib/types'
import { fmtDuration } from '../../lib/time'

const DURATIONS = [15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240]
type Kind = ServiceKind
type Form = {
  id?: string; name: string; description: string; duration_min: number; price_ars: string; is_active: boolean
  kind: Kind; capacity: string; unit_label: string; max_qty: string
}
const EMPTY: Form = { name: '', description: '', duration_min: 30, price_ars: '', is_active: true, kind: 'turno', capacity: '10', unit_label: 'unidad', max_qty: '50' }
const UNITS = ['unidad', 'docena', 'porción', 'kg', 'bandeja', 'persona']
const KINDS: { v: Kind; title: string; text: string }[] = [
  { v: 'turno', title: 'Turno', text: 'Un cliente por horario (corte, consulta, visita)' },
  { v: 'clase', title: 'Clase con cupos', text: 'Varios en el mismo horario (funcional, yoga, visita guiada)' },
  { v: 'unidad', title: 'Por unidad', text: 'El cliente elige la cantidad (empanadas, viandas, tortas)' },
]
const toForm = (s: Service): Form => ({
  id: s.id, name: s.name, description: s.description ?? '', duration_min: s.duration_min, price_ars: String(Number(s.price_ars)), is_active: s.is_active,
  kind: s.unit_label ? 'unidad' : s.capacity > 1 ? 'clase' : 'turno',
  capacity: String(s.capacity > 1 ? s.capacity : s.unit_label ? 1 : 10), unit_label: s.unit_label ?? 'unidad', max_qty: String(s.unit_label ? s.max_qty : 50),
})

export default function Services() {
  const { current } = useBusiness()
  const b = current!.business
  const tr = termsFor(b.category)
  const allowed = kindsFor(modulesOf(b.category, b.modules))
  const kindOf = (s: Service): ServiceKind => (s.unit_label ? 'unidad' : s.capacity > 1 ? 'clase' : 'turno')
  const isFood = b.category === 'gastronomia'
  const fresh = (): Form => ({ ...EMPTY, kind: allowed[0], duration_min: allowed[0] === 'unidad' ? 30 : EMPTY.duration_min, capacity: allowed[0] === 'unidad' ? '5' : EMPTY.capacity })
  const one = isFood ? 'producto' : 'servicio'
  const [list, setList] = useState<Service[] | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('services').select('*').eq('business_id', b.id).order('sort_order').order('name')
    if (error) setError(errorMessage(error))
    setList((data ?? []) as Service[])
  }, [b.id])
  useEffect(() => { load() }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError('')
    const price = Number(String(form.price_ars).replace(/\./g, '').replace(',', '.'))
    if (form.name.trim().length < 2) return setError('Poné un nombre al servicio')
    if (!Number.isFinite(price) || price < 0) return setError('El precio no es válido')
    const cap = Math.round(Number(form.capacity))
    const maxQty = Math.round(Number(form.max_qty))
    const unit = form.unit_label.trim()
    if (form.kind === 'clase' && !(cap >= 2 && cap <= 500)) return setError('Los cupos tienen que ser entre 2 y 500')
    if (form.kind === 'unidad') {
      if (unit.length < 1 || unit.length > 20) return setError('Escribí la unidad (ej: docena)')
      if (!(maxQty >= 1 && maxQty <= 999)) return setError('La cantidad máxima tiene que ser entre 1 y 999')
      if (!(cap >= 1 && cap <= 500)) return setError('Los pedidos por horario tienen que ser entre 1 y 500')
    }
    setBusy(true)
    const row = {
      name: form.name.trim(), description: form.description.trim() || null, duration_min: form.duration_min, price_ars: price, is_active: form.is_active,
      capacity: form.kind === 'turno' ? 1 : cap,
      unit_label: form.kind === 'unidad' ? unit : null,
      max_qty: form.kind === 'unidad' ? maxQty : 1,
    }
    const res = form.id
      ? await supabase.from('services').update(row).eq('id', form.id)
      : await supabase.from('services').insert({ ...row, business_id: b.id, sort_order: (list?.length ?? 0) + 1 })
    setBusy(false)
    if (res.error) return setError(errorMessage(res.error))
    setForm(null)
    load()
  }

  async function toggle(s: Service) {
    const { error } = await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id)
    if (error) return setError(errorMessage(error))
    load()
  }

  return (
    <div>
      <PageHeader
        title={tr.servicesNav}
        subtitle={tr.servicesSub}
        action={<button className="btn-primary" onClick={() => { setError(''); setForm(fresh()) }}><Plus className="h-4 w-4" /> Nuevo {one}</button>}
      />
      {error && !form && <div className="mb-4"><Alert>{error}</Alert></div>}

      {!list ? (
        <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
      ) : list.length === 0 ? (
        <Empty icon={<Scissors className="h-6 w-6" />} title={`Todavía no cargaste ${isFood ? 'productos' : 'servicios'}`}
          text="Ej: Corte de pelo, 30 min, $8.000. Después asignalos a cada profesional."
          action={<button className="btn-primary" onClick={() => setForm(fresh())}><Plus className="h-4 w-4" /> Cargar el primero</button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <div key={s.id} className={`card p-4 animate-fade-up ${s.is_active ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{s.name}</div>
                  {s.description && <div className="mt-0.5 line-clamp-2 text-xs text-volt-muted">{s.description}</div>}
                  {!allowed.includes(kindOf(s)) && <div className="mt-1 text-xs font-medium text-volt-amber">No se muestra: su módulo está apagado en Mi negocio</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded-lg p-2 text-volt-muted hover:bg-white/5 hover:text-volt-white" title={s.is_active ? 'Ocultar' : 'Mostrar'} onClick={() => toggle(s)}>
                    {s.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button className="rounded-lg p-2 text-volt-muted hover:bg-white/5 hover:text-volt-white" title="Editar"
                    onClick={() => { setError(''); setForm(toForm(s)) }}>
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-volt-muted">
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {fmtDuration(s.duration_min)}</span>
                  {s.capacity > 1 && <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {s.capacity} {s.unit_label ? 'pedidos/horario' : 'cupos'}</span>}
                  {s.unit_label && <span className="flex items-center gap-1.5"><Package className="h-4 w-4" /> hasta {s.max_qty}</span>}
                </span>
                <span className="text-lg font-bold">{priceLabel(s)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Editar ${one}` : `Nuevo ${one}`}
        footer={<button form="svc-form" className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Guardar'}</button>}>
        {form && (
          <form id="svc-form" onSubmit={save} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <Field label="Nombre"><input className="input" autoFocus maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isFood ? 'Empanadas' : b.category === 'gimnasio' ? 'Funcional' : 'Corte de pelo'} /></Field>
            <Field label="Descripción (opcional)"><input className="input" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={isFood ? 'Carne, pollo o jamón y queso' : b.category === 'gimnasio' ? 'Traé toalla y agua' : 'Incluye lavado'} /></Field>
            {(() => {
              const opts = KINDS.filter((k) => allowed.includes(k.v) || k.v === form.kind)
              if (opts.length < 2) return null
              return (
                <div>
                  <span className="label">¿Cómo se reserva?</span>
                  <div className={`grid gap-2 ${opts.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                    {opts.map((k) => (
                      <button type="button" key={k.v} onClick={() => setForm({ ...form, kind: k.v, duration_min: k.v === 'unidad' && form.kind !== 'unidad' ? 30 : form.duration_min })}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${form.kind === k.v ? 'border-volt-violet bg-volt-violet/15' : 'border-volt-line hover:border-volt-violet/40'}`}>
                        <span className="block text-sm font-semibold">{k.title}</span>
                        <span className="block text-xs text-volt-muted">{k.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
            {form.kind === 'clase' && (
              <Field label="Cupos por clase" hint="Cuántas personas se pueden anotar en el mismo horario">
                <input className="input max-w-[10rem]" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, '') })} placeholder="15" />
              </Field>
            )}
            {form.kind === 'unidad' && (
              <div className="space-y-3 rounded-xl border border-volt-line p-3">
                <Field label="Se vende por">
                  <input className="input" maxLength={20} value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} placeholder="docena" />
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {UNITS.map((u) => (
                    <button type="button" key={u} onClick={() => setForm({ ...form, unit_label: u })}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${form.unit_label === u ? 'border-volt-violet bg-volt-violet/15' : 'border-volt-line text-volt-muted'}`}>{u}</button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Máximo por pedido">
                    <input className="input" inputMode="numeric" value={form.max_qty} onChange={(e) => setForm({ ...form, max_qty: e.target.value.replace(/\D/g, '') })} placeholder="50" />
                  </Field>
                  <Field label="Pedidos por horario" hint="Cuántos pedidos podés entregar a la misma hora">
                    <input className="input" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, '') })} placeholder="5" />
                  </Field>
                </div>
              </div>
            )}
            <div>
              <span className="label">{form.kind === 'unidad' ? 'Franja de retiro o entrega (cada cuánto)' : form.kind === 'clase' ? 'Duración de la clase' : 'Duración'}</span>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button type="button" key={d} onClick={() => setForm({ ...form, duration_min: d })}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${form.duration_min === d ? 'border-volt-violet bg-volt-violet/15 text-volt-white' : 'border-volt-line text-volt-muted hover:border-volt-violet/40'}`}>
                    {fmtDuration(d)}
                  </button>
                ))}
              </div>
            </div>
            <Field label={form.kind === 'unidad' ? `Precio por ${form.unit_label.trim() || 'unidad'} (ARS)` : form.kind === 'clase' ? 'Precio por persona (ARS)' : 'Precio (ARS)'}>
              <input className="input" inputMode="decimal" value={form.price_ars} onChange={(e) => setForm({ ...form, price_ars: e.target.value })} placeholder="8000" />
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-volt-violet" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Visible para reservar
            </label>
          </form>
        )}
      </Modal>
    </div>
  )
}
