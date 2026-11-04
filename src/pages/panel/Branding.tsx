import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Trash2, Check, ExternalLink, Loader2, MapPin, Clock, Undo2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, PageHeader, Spinner } from '../../components/ui'
import { TEMPLATES, ars, type Service, type Template } from '../../lib/types'
import { makeTheme } from '../../components/booking'
import { uploadBusinessImage, removeBusinessImage } from '../../lib/images'
import { publicUrl } from '../../lib/share'
import { fmtDuration } from '../../lib/time'

interface Draft {
  template: Template
  primary_color: string
  secondary_color: string
  background_color: string
  logo_url: string | null
  cover_url: string | null
  gallery: string[]
}

export default function Branding() {
  const { refresh } = useAuth()
  const { current, plan } = useBusiness()
  const b = current!.business
  const initial: Draft = {
    template: b.template, primary_color: b.primary_color, secondary_color: b.secondary_color, background_color: b.background_color,
    logo_url: b.logo_url, cover_url: b.cover_url, gallery: b.gallery ?? [],
  }
  const [d, setD] = useState<Draft>(initial)
  const [services, setServices] = useState<Service[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const advanced = Boolean(plan?.features?.advanced_branding)

  useEffect(() => {
    supabase.from('services').select('*').eq('business_id', b.id).eq('is_active', true).order('sort_order').limit(3)
      .then(({ data }) => setServices((data ?? []) as Service[]))
  }, [b.id])

  const dirty = JSON.stringify(d) !== JSON.stringify(initial)

  async function upload(kind: 'logo' | 'cover' | 'foto', file: File | undefined) {
    if (!file) return
    setError(''); setOk(''); setUploading(kind)
    try {
      const url = await uploadBusinessImage(b.id, file, kind)
      setD((x) => kind === 'logo' ? { ...x, logo_url: url } : kind === 'cover' ? { ...x, cover_url: url } : { ...x, gallery: [...x.gallery, url].slice(0, 8) })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(null)
    }
  }

  async function save() {
    setError(''); setOk(''); setBusy(true)
    const { error } = await supabase.from('businesses').update(d).eq('id', b.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    // Limpia imágenes reemplazadas
    if (initial.logo_url && initial.logo_url !== d.logo_url) removeBusinessImage(initial.logo_url)
    if (initial.cover_url && initial.cover_url !== d.cover_url) removeBusinessImage(initial.cover_url)
    initial.gallery.filter((u) => !d.gallery.includes(u)).forEach((u) => removeBusinessImage(u))
    await refresh()
    setOk('¡Listo! Tu página ya se ve así.')
  }

  const pickTemplate = (t: Template) => {
    const tp = TEMPLATES[t]
    setD({ ...d, template: t, primary_color: tp.primary, secondary_color: tp.secondary, background_color: tp.background })
  }

  return (
    <div>
      <PageHeader title="Diseño de mi página" subtitle="Lo que ven tus clientes cuando entran a reservar"
        action={<a href={publicUrl(b.slug)} target="_blank" rel="noreferrer" className="btn-ghost py-2.5 text-sm"><ExternalLink className="h-4 w-4" /> Ver página</a>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {ok && <Alert kind="success">{ok}</Alert>}

          <Section title="Estilo">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(TEMPLATES) as Template[]).map((t) => {
                const tp = TEMPLATES[t]
                const on = d.template === t
                return (
                  <button key={t} onClick={() => pickTemplate(t)}
                    className={`overflow-hidden rounded-xl border text-left transition ${on ? 'border-volt-violet ring-2 ring-volt-violet/40' : 'border-volt-line hover:border-volt-violet/40'}`}>
                    <div className="flex h-12" style={{ background: tp.background }}>
                      <div className="w-1/2" style={{ background: `linear-gradient(135deg, ${tp.primary}, ${tp.secondary})` }} />
                      <div className="flex flex-1 items-center justify-center"><span className="h-4 w-10 rounded-full" style={{ background: tp.primary }} /></div>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-2 text-xs font-semibold">{tp.label}{on && <Check className="h-3.5 w-3.5 text-volt-violet2" />}</div>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title="Colores" note={advanced ? undefined : 'Elegir colores a medida es del plan Pro. Con tu plan podés usar los estilos de arriba.'}>
            <div className="grid gap-3 sm:grid-cols-3">
              {([['primary_color', 'Principal (botones)'], ['secondary_color', 'Secundario (portada)'], ['background_color', 'Fondo']] as const).map(([k, label]) => (
                <label key={k} className={`flex items-center gap-3 rounded-xl border border-volt-line p-2.5 ${advanced ? '' : 'pointer-events-none opacity-50'}`}>
                  <input type="color" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value.toUpperCase() })}
                    className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                  <span className="min-w-0">
                    <span className="block text-xs text-volt-muted">{label}</span>
                    <span className="font-mono text-sm">{d[k]}</span>
                  </span>
                </label>
              ))}
            </div>
          </Section>

          <Section title="Logo" note="Cuadrado, se ve en redondo. Lo achicamos automáticamente.">
            <ImageSlot url={d.logo_url} square uploading={uploading === 'logo'} onPick={(f) => upload('logo', f)} onRemove={() => setD({ ...d, logo_url: null })} />
          </Section>

          <Section title="Portada" note="Foto horizontal del local o de tus trabajos.">
            <ImageSlot url={d.cover_url} uploading={uploading === 'cover'} onPick={(f) => upload('cover', f)} onRemove={() => setD({ ...d, cover_url: null })} />
          </Section>

          <Section title={`Fotos de trabajos (${d.gallery.length}/8)`} note="Se muestran en tu página para que el cliente vea lo que hacés.">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {d.gallery.map((u) => (
                <div key={u} className="group relative aspect-square overflow-hidden rounded-xl border border-volt-line">
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => setD({ ...d, gallery: d.gallery.filter((x) => x !== u) })} className="absolute right-1 top-1 rounded-lg bg-black/70 p-1.5 text-white" aria-label="Quitar"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {d.gallery.length < 8 && (
                <FilePick onPick={(f) => upload('foto', f)}>
                  <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-volt-line text-volt-muted hover:border-volt-violet/50">
                    {uploading === 'foto' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  </div>
                </FilePick>
              )}
            </div>
          </Section>

          {/* Barra de guardado */}
          <div className={`sticky bottom-0 z-10 -mx-4 border-t border-volt-line bg-volt-bg/90 px-4 py-3 backdrop-blur transition sm:mx-0 sm:rounded-2xl sm:border ${dirty ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm text-volt-muted">{dirty ? 'Tenés cambios sin publicar' : 'Todo publicado'}</span>
              {dirty && <button className="btn-ghost py-2 text-sm" onClick={() => setD(initial)}><Undo2 className="h-4 w-4" /> Descartar</button>}
              <button className="btn-primary py-2 text-sm" onClick={save} disabled={!dirty || busy || !!uploading}>{busy ? <Spinner /> : 'Publicar cambios'}</button>
            </div>
          </div>
        </div>

        {/* Vista previa */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-volt-muted">Vista previa en vivo</div>
          <Preview d={d} name={b.name} address={[b.address, b.city].filter(Boolean).join(', ')} services={services} />
        </div>
      </div>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-volt-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function FilePick({ onPick, children }: { onPick: (f: File | undefined) => void; children: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <button type="button" onClick={() => ref.current?.click()} className="block w-full text-left">
      {children}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }} />
    </button>
  )
}

function ImageSlot({ url, square, uploading, onPick, onRemove }: { url: string | null; square?: boolean; uploading: boolean; onPick: (f: File | undefined) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <FilePick onPick={onPick}>
        <div className={`grid shrink-0 place-items-center overflow-hidden border border-dashed border-volt-line bg-volt-bg text-volt-muted hover:border-volt-violet/50 ${square ? 'h-24 w-24 rounded-3xl' : 'h-24 w-44 rounded-2xl'}`}>
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
        </div>
      </FilePick>
      <div className="flex flex-col gap-2">
        <FilePick onPick={onPick}><span className="btn-ghost py-2 text-sm">{url ? 'Cambiar' : 'Subir imagen'}</span></FilePick>
        {url && <button className="text-left text-xs text-volt-muted hover:text-volt-red" onClick={onRemove}>Quitar</button>}
      </div>
    </div>
  )
}

function Preview({ d, name, address, services }: { d: Draft; name: string; address: string; services: Service[] }) {
  const t = makeTheme(d.primary_color, d.background_color)
  const sample = services.length ? services : [{ id: 'a', name: 'Corte de pelo', duration_min: 30, price_ars: 8000 }, { id: 'b', name: 'Barba', duration_min: 20, price_ars: 5000 }] as Service[]
  return (
    <div className="mx-auto w-[300px] rounded-[2.4rem] border-[10px] border-[#1d2233] bg-black shadow-2xl">
      <div className="h-[560px] overflow-hidden overflow-y-auto rounded-[1.8rem] [scrollbar-width:none]" style={{ background: t.bg, color: t.fg }}>
        <div className="h-28" style={{ background: d.cover_url ? `url(${d.cover_url}) center/cover` : `linear-gradient(135deg, ${d.primary_color}, ${d.secondary_color})` }} />
        <div className="-mt-8 px-4">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border-4 text-xl font-extrabold" style={{ borderColor: t.bg, background: d.primary_color, color: t.onPrimary }}>
            {d.logo_url ? <img src={d.logo_url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
          </div>
          <div className="mt-2 text-lg font-extrabold leading-tight">{name}</div>
          {address && <div className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: t.muted }}><MapPin className="h-3 w-3" /> {address}</div>}
          {d.gallery.length > 0 && (
            <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
              {d.gallery.map((u) => <img key={u} src={u} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />)}
            </div>
          )}
          <div className="mt-4 text-sm font-bold">¿Qué te querés hacer?</div>
          <div className="mt-2 space-y-1.5">
            {sample.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border p-2.5 text-xs" style={{ background: i === 0 ? `${t.primary}1f` : t.card, borderColor: i === 0 ? t.primary : t.line }}>
                <span className="grid h-4 w-4 place-items-center rounded-full" style={{ background: i === 0 ? t.primary : 'transparent', border: `2px solid ${i === 0 ? t.primary : t.line}`, color: t.onPrimary }}>{i === 0 && <Check className="h-2.5 w-2.5" strokeWidth={4} />}</span>
                <span className="flex-1"><b className="block">{s.name}</b><span className="flex items-center gap-1" style={{ color: t.muted }}><Clock className="h-2.5 w-2.5" /> {fmtDuration(s.duration_min)}</span></span>
                <b>{ars(Number(s.price_ars))}</b>
              </div>
            ))}
          </div>
          <div className="mt-4 mb-6 rounded-xl py-3 text-center text-sm font-bold" style={{ background: t.primary, color: t.onPrimary }}>Continuar</div>
        </div>
      </div>
    </div>
  )
}
