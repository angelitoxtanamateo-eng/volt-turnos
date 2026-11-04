import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Alert, Field, Logo, Spinner } from '../components/ui'
import { CATEGORIES, CATEGORY_TEMPLATE, TEMPLATES, slugify, type Business, type Category } from '../lib/types'

type SlugState = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$/

export default function CreateBusiness() {
  const { refresh, memberships, signOut } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [category, setCategory] = useState<Category>('peluqueria')
  const [slugState, setSlugState] = useState<SlugState>('idle')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!slugTouched) setSlug(slugify(name)) }, [name, slugTouched])

  // Chequeo de disponibilidad con pequeño retraso
  useEffect(() => {
    if (!slug) { setSlugState('idle'); return }
    if (!SLUG_RE.test(slug) || slug.includes('--')) { setSlugState('invalid'); return }
    setSlugState('checking')
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('check_slug_available', { p_slug: slug })
      if (error) setSlugState('idle')
      else setSlugState(data ? 'ok' : 'taken')
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) return setError('Ingresá el nombre del negocio')
    if (slugState === 'taken') return setError('Esa dirección ya está en uso, probá otra')
    if (slugState === 'invalid') return setError('La dirección solo puede tener letras, números y guiones (mínimo 3)')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_business', {
      p_name: name.trim(),
      p_slug: slug,
      p_category: category,
      p_template: CATEGORY_TEMPLATE[category],
    })
    if (error) { setBusy(false); return setError(errorMessage(error)) }
    const created = data as Business
    // Aplica los colores de la plantilla elegida
    const t = TEMPLATES[CATEGORY_TEMPLATE[category]]
    await supabase.from('businesses').update({
      primary_color: t.primary, secondary_color: t.secondary, background_color: t.background,
    }).eq('id', created.id)
    try { localStorage.setItem('volt:currentBusiness', created.id) } catch { /* sin storage */ }
    await refresh()
    setBusy(false)
    navigate('/panel', { replace: true })
  }

  const host = window.location.host
  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-volt-violet/25 blur-[120px]" />
      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          {memberships.length > 0
            ? <Link to="/panel" className="text-sm text-volt-muted hover:text-volt-white">Volver al panel</Link>
            : <button onClick={() => signOut()} className="text-sm text-volt-muted hover:text-volt-white">Salir</button>}
        </div>

        <div className="card p-6 animate-fade-up">
          <span className="chip bg-volt-violet/15 text-volt-violet2">Paso 1 de 3</span>
          <h1 className="mt-3 text-xl font-bold">Creá tu negocio</h1>
          <p className="mt-1 text-sm text-volt-muted">En un minuto tenés tu link de reservas.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            {error && <Alert>{error}</Alert>}

            <Field label="Nombre del negocio">
              <input className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Wachas Estilistas" />
            </Field>

            <Field
              label="Tu dirección web"
              hint={
                slugState === 'taken' ? <span className="text-red-300">Ya está en uso</span>
                : slugState === 'invalid' ? <span className="text-red-300">Solo minúsculas, números y guiones</span>
                : <>Tus clientes reservan en <b className="text-volt-white">{host}/{slug || 'tu-negocio'}</b></>
              }
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-volt-muted">/</span>
                <input
                  className="input pl-7 pr-10"
                  value={slug}
                  maxLength={50}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
                  placeholder="wachas-estilistas"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {slugState === 'checking' && <Spinner className="h-4 w-4 text-volt-muted" />}
                  {slugState === 'ok' && <Check className="h-4 w-4 text-volt-green" />}
                  {(slugState === 'taken' || slugState === 'invalid') && <X className="h-4 w-4 text-volt-red" />}
                </span>
              </div>
            </Field>

            <div>
              <span className="label">Rubro</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORIES.map((c) => {
                  const t = TEMPLATES[CATEGORY_TEMPLATE[c.value]]
                  const active = c.value === category
                  return (
                    <button
                      type="button"
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      className={`rounded-xl border px-3 py-3 text-left text-sm transition ${active ? 'border-volt-violet bg-volt-violet/10' : 'border-volt-line hover:border-volt-violet/40'}`}
                    >
                      <span className="mb-2 flex gap-1">
                        <span className="h-3 w-3 rounded-full" style={{ background: t.primary }} />
                        <span className="h-3 w-3 rounded-full border border-white/10" style={{ background: t.secondary }} />
                      </span>
                      <span className="font-semibold">{c.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-volt-muted">Te aplicamos la plantilla <b>{TEMPLATES[CATEGORY_TEMPLATE[category]].label}</b>. Después la podés personalizar.</p>
            </div>

            <button className="btn-primary w-full" disabled={busy || slugState === 'checking'}>
              {busy ? <Spinner /> : 'Crear negocio y empezar prueba gratis'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
