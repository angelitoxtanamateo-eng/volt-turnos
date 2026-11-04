import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Scissors, Clock, Pencil, Eye, EyeOff } from 'lucide-react'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Empty, Field, PageHeader, Spinner } from '../../components/ui'
import Modal from '../../components/Modal'
import { ars, type Service } from '../../lib/types'
import { fmtDuration } from '../../lib/time'

const DURATIONS = [15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240]
type Form = { id?: string; name: string; description: string; duration_min: number; price_ars: string; is_active: boolean }
const EMPTY: Form = { name: '', description: '', duration_min: 30, price_ars: '', is_active: true }

export default function Services() {
  const { current } = useBusiness()
  const b = current!.business
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
    setBusy(true)
    const row = { name: form.name.trim(), description: form.description.trim() || null, duration_min: form.duration_min, price_ars: price, is_active: form.is_active }
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
        title="Servicios"
        subtitle="Lo que tus clientes pueden reservar"
        action={<button className="btn-primary" onClick={() => { setError(''); setForm(EMPTY) }}><Plus className="h-4 w-4" /> Nuevo servicio</button>}
      />
      {error && !form && <div className="mb-4"><Alert>{error}</Alert></div>}

      {!list ? (
        <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
      ) : list.length === 0 ? (
        <Empty icon={<Scissors className="h-6 w-6" />} title="Todavía no cargaste servicios"
          text="Ej: Corte de pelo, 30 min, $8.000. Después asignalos a cada profesional."
          action={<button className="btn-primary" onClick={() => setForm(EMPTY)}><Plus className="h-4 w-4" /> Cargar el primero</button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <div key={s.id} className={`card p-4 animate-fade-up ${s.is_active ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{s.name}</div>
                  {s.description && <div className="mt-0.5 line-clamp-2 text-xs text-volt-muted">{s.description}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded-lg p-2 text-volt-muted hover:bg-white/5 hover:text-volt-white" title={s.is_active ? 'Ocultar' : 'Mostrar'} onClick={() => toggle(s)}>
                    {s.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button className="rounded-lg p-2 text-volt-muted hover:bg-white/5 hover:text-volt-white" title="Editar"
                    onClick={() => { setError(''); setForm({ id: s.id, name: s.name, description: s.description ?? '', duration_min: s.duration_min, price_ars: String(Number(s.price_ars)), is_active: s.is_active }) }}>
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-volt-muted"><Clock className="h-4 w-4" /> {fmtDuration(s.duration_min)}</span>
                <span className="text-lg font-bold">{ars(Number(s.price_ars))}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar servicio' : 'Nuevo servicio'}
        footer={<button form="svc-form" className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Guardar'}</button>}>
        {form && (
          <form id="svc-form" onSubmit={save} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <Field label="Nombre"><input className="input" autoFocus maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Corte de pelo" /></Field>
            <Field label="Descripción (opcional)"><input className="input" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Incluye lavado" /></Field>
            <div>
              <span className="label">Duración</span>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button type="button" key={d} onClick={() => setForm({ ...form, duration_min: d })}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${form.duration_min === d ? 'border-volt-violet bg-volt-violet/15 text-volt-white' : 'border-volt-line text-volt-muted hover:border-volt-violet/40'}`}>
                    {fmtDuration(d)}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Precio (ARS)">
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
