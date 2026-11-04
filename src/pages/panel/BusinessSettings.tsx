import { useEffect, useState, type FormEvent } from 'react'
import { Globe, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Field, PageHeader, Spinner } from '../../components/ui'
import { CATEGORIES, type Category } from '../../lib/types'
import { publicUrl, waNumber } from '../../lib/share'

export default function BusinessSettings() {
  const { refresh } = useAuth()
  const { current } = useBusiness()
  const b = current!.business
  const [form, setForm] = useState({
    name: b.name, category: b.category, description: b.description ?? '', phone: b.phone ?? '', whatsapp: b.whatsapp ?? '',
    address: b.address ?? '', city: b.city ?? '', instagram: b.socials?.instagram ?? '', facebook: b.socials?.facebook ?? '', tiktok: b.socials?.tiktok ?? '',
  })
  const [published, setPublished] = useState(b.is_published)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setPublished(b.is_published) }, [b.is_published])

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (form.name.trim().length < 2) return setError('El nombre es obligatorio')
    if (form.whatsapp && !waNumber(form.whatsapp)) return setError('El WhatsApp no parece válido. Usá característica + número, ej: 358 123 4567')
    setBusy(true)
    const clean = (s: string) => s.trim() || null
    const handle = (s: string) => s.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram|facebook|tiktok)\.com\/@?/i, '').replace(/\/$/, '')
    const socials: Record<string, string> = {}
    if (form.instagram.trim()) socials.instagram = handle(form.instagram)
    if (form.facebook.trim()) socials.facebook = handle(form.facebook)
    if (form.tiktok.trim()) socials.tiktok = handle(form.tiktok)
    const { error } = await supabase.from('businesses').update({
      name: form.name.trim(), category: form.category, description: clean(form.description), phone: clean(form.phone),
      whatsapp: clean(form.whatsapp), address: clean(form.address), city: clean(form.city), socials,
    }).eq('id', b.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    await refresh()
    setOk('Cambios guardados')
  }

  async function togglePublish() {
    setError(''); setOk('')
    const next = !published
    if (next && !b.whatsapp && !form.whatsapp) return setError('Cargá un WhatsApp antes de publicar, así tus clientes te pueden escribir.')
    setPublished(next)
    const { error } = await supabase.from('businesses').update({ is_published: next }).eq('id', b.id)
    if (error) { setPublished(!next); return setError(errorMessage(error)) }
    await refresh()
    setOk(next ? '¡Tu página está publicada!' : 'Tu página quedó privada')
  }

  return (
    <div>
      <PageHeader title="Mi negocio" subtitle="Datos que ven tus clientes en tu página" />
      <div className="mb-4 space-y-3">
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">{ok}</Alert>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={save} className="card space-y-4 p-5 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre"><input className="input" maxLength={80} value={form.name} onChange={set('name')} /></Field>
            <Field label="Rubro">
              <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descripción" hint={`${form.description.length}/600`}>
            <textarea className="input min-h-[96px]" maxLength={600} value={form.description} onChange={set('description')} placeholder="Cortes, color y peinados en el centro de Río Cuarto." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp"><input className="input" type="tel" inputMode="tel" maxLength={30} value={form.whatsapp} onChange={set('whatsapp')} placeholder="358 123 4567" /></Field>
            <Field label="Teléfono fijo (opcional)"><input className="input" type="tel" maxLength={30} value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Dirección"><input className="input" maxLength={200} value={form.address} onChange={set('address')} placeholder="Constitución 1234" /></Field>
            <Field label="Ciudad"><input className="input" maxLength={80} value={form.city} onChange={set('city')} placeholder="Río Cuarto" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Instagram"><input className="input" value={form.instagram} onChange={set('instagram')} placeholder="@tunegocio" /></Field>
            <Field label="Facebook"><input className="input" value={form.facebook} onChange={set('facebook')} placeholder="tunegocio" /></Field>
            <Field label="TikTok"><input className="input" value={form.tiktok} onChange={set('tiktok')} placeholder="@tunegocio" /></Field>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy}>{busy ? <Spinner /> : 'Guardar cambios'}</button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${published ? 'bg-volt-green/15 text-volt-green' : 'bg-white/5 text-volt-muted'}`}>
                {published ? <Globe className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
              </span>
              <div>
                <div className="font-semibold">{published ? 'Página publicada' : 'Página privada'}</div>
                <div className="text-xs text-volt-muted">{published ? 'Cualquiera con el link puede verla' : 'Solo vos y tu equipo la ven'}</div>
              </div>
            </div>
            <button onClick={togglePublish} className={`${published ? 'btn-ghost' : 'btn-primary'} mt-4 w-full`}>
              {published ? 'Despublicar' : 'Publicar página'}
            </button>
          </div>
          <div className="card p-5">
            <div className="text-sm text-volt-muted">Tu dirección</div>
            <div className="mt-1 break-all font-mono text-sm text-volt-violet2">{publicUrl(b.slug).replace(/^https?:\/\//, '')}</div>
            <p className="mt-3 text-xs text-volt-muted">Logo, portada, colores y plantillas se personalizan en la próxima etapa.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
