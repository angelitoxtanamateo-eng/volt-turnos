import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  MapPin, MessageCircle, Instagram, Facebook, EyeOff, ArrowLeft, Check, Clock, CalendarPlus, Users, Loader2, CalendarCheck, ExternalLink,
} from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { FullScreenLoader, Logo } from '../components/ui'
import { waLink } from '../lib/share'
import { ars } from '../lib/types'
import { fmtDuration, hmInTz, longDate, todayInTz, ymdInTz } from '../lib/time'
import { DateStrip, SlotGrid, googleCalendarUrl, makeTheme } from '../components/booking'
import { manageUrl, msgClientToBusiness } from '../lib/messages'

interface Biz {
  id: string; slug: string; name: string; description: string | null; logo_url: string | null; cover_url: string | null
  primary_color: string; secondary_color: string; background_color: string; socials: Record<string, string>
  whatsapp: string | null; address: string | null; city: string | null; timezone: string; is_published: boolean
  max_days_ahead: number; cancel_limit_hours: number; accepting: boolean; gallery?: string[]
}
interface Svc { id: string; name: string; description: string | null; duration_min: number; price_ars: number }
interface Pro { id: string; name: string; specialty: string | null; photo_url: string | null; service_ids: string[] }
interface Catalog { business: Biz; services: Svc[]; professionals: Pro[] }
interface Booking { token: string; starts_at: string; ends_at: string; total_price: number; professional: { name: string }; services: { name: string }[] }

type Step = 'servicios' | 'profesional' | 'horario' | 'datos' | 'listo'

export default function PublicBusiness() {
  const { slug = '' } = useParams()
  const [cat, setCat] = useState<Catalog | null | undefined>(undefined)
  const [step, setStep] = useState<Step>('servicios')
  const [svc, setSvc] = useState<string[]>([])
  const [pro, setPro] = useState<string | null>(null) // null = cualquiera
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<{ t: string; p: string }[] | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    supabase.rpc('get_booking_catalog', { p_slug: slug }).then(({ data }) => setCat((data as Catalog) ?? null))
    try {
      const saved = JSON.parse(localStorage.getItem('volt:cliente') ?? 'null')
      if (saved?.name) setForm((f) => ({ ...f, name: saved.name, phone: saved.phone ?? '' }))
    } catch { /* sin storage */ }
  }, [slug])

  useEffect(() => { if (cat) { document.title = `${cat.business.name} · Reservá tu turno`; setDate(todayInTz(cat.business.timezone)) } }, [cat])

  const biz = cat?.business
  const tz = biz?.timezone ?? 'America/Argentina/Cordoba'
  const eligible = useMemo(() => (cat?.professionals ?? []).filter((p) => svc.every((s) => p.service_ids.includes(s))), [cat, svc])

  // Horarios del día elegido
  useEffect(() => {
    if (step !== 'horario' || !date || !cat) return
    let alive = true
    setSlots(null); setSlot(null)
    supabase.rpc('get_available_slots', { p_slug: slug, p_service_ids: svc, p_professional_id: pro, p_date: date })
      .then(({ data }) => { if (alive) setSlots((data ?? []) as { t: string; p: string }[]) })
    return () => { alive = false }
  }, [step, date, pro, svc, slug, cat, reloadKey])

  if (cat === undefined) return <FullScreenLoader />
  if (!cat || !biz) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-4 text-center">
        <div>
          <Logo />
          <h1 className="mt-8 text-2xl font-bold">No encontramos este negocio</h1>
          <p className="mt-2 text-sm text-volt-muted">Revisá que el link esté bien escrito.</p>
          <Link to="/" className="btn-primary mt-6">Ir a VOLT Turnos</Link>
        </div>
      </div>
    )
  }

  const t = makeTheme(biz.primary_color, biz.background_color)
  const chosen = cat.services.filter((s) => svc.includes(s.id))
  const totalMin = chosen.reduce((a, s) => a + s.duration_min, 0)
  const totalPrice = chosen.reduce((a, s) => a + Number(s.price_ars), 0)
  const proName = (id: string | null) => cat.professionals.find((p) => p.id === id)?.name
  const ig = biz.socials?.instagram
  const fb = biz.socials?.facebook
  const address = [biz.address, biz.city].filter(Boolean).join(', ')

  function next() {
    setError('')
    if (step === 'servicios') {
      if (!svc.length) return setError('Elegí al menos un servicio')
      const el = cat!.professionals.filter((p) => svc.every((s) => p.service_ids.includes(s)))
      if (!el.length) return setError('Ningún profesional hace todos esos servicios juntos. Probá con menos.')
      if (el.length === 1) { setPro(el[0].id); setStep('horario') } else setStep('profesional')
    }
  }
  function back() {
    setError('')
    if (step === 'profesional') setStep('servicios')
    else if (step === 'horario') setStep(eligible.length > 1 ? 'profesional' : 'servicios')
    else if (step === 'datos') setStep('horario')
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.name.trim().length < 2) return setError('Ingresá tu nombre')
    if (form.phone.replace(/\D/g, '').length < 8) return setError('Ingresá tu WhatsApp con característica')
    setBusy(true)
    const chosenSlot = slots?.find((s) => s.t === slot)
    const { data, error } = await supabase.rpc('create_booking', {
      p_slug: slug, p_service_ids: svc, p_professional_id: pro ?? chosenSlot?.p ?? null, p_starts_at: slot,
      p_name: form.name.trim(), p_phone: form.phone.trim(), p_email: form.email.trim() || null,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      if (error.code === '23P01') { setStep('horario'); setReloadKey((k) => k + 1) }
      return
    }
    try { localStorage.setItem('volt:cliente', JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() })) } catch { /* sin storage */ }
    setBooking(data as Booking)
    setStep('listo')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const header = (
    <>
      {!biz.is_published && (
        <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black">
          <EyeOff className="h-4 w-4" /> Vista previa: tu página todavía no está publicada
        </div>
      )}
      <div className="h-36 sm:h-48" style={{ background: biz.cover_url ? `url(${biz.cover_url}) center/cover` : `linear-gradient(135deg, ${biz.primary_color}, ${biz.secondary_color})` }} />
      <div className="mx-auto -mt-11 max-w-xl px-4">
        <div className="grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-3xl border-4 text-3xl font-extrabold shadow-xl"
          style={{ borderColor: t.bg, background: biz.primary_color, color: t.onPrimary }}>
          {biz.logo_url ? <img src={biz.logo_url} alt={biz.name} className="h-full w-full object-cover" /> : biz.name.charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{biz.name}</h1>
        {address && <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: t.muted }}><MapPin className="h-4 w-4" /> {address}</p>}
      </div>
    </>
  )

  const cardStyle = { background: t.card, borderColor: t.line }
  const primaryBtn = { background: t.primary, color: t.onPrimary }

  return (
    <div className="min-h-[100dvh] pb-28" style={{ background: t.bg, color: t.fg }}>
      {step !== 'listo' && header}

      <div className="mx-auto max-w-xl px-4">
        {/* Encabezado del paso */}
        {step !== 'servicios' && step !== 'listo' && (
          <div className="mt-6 flex items-center gap-3">
            <button onClick={back} className="grid h-10 w-10 place-items-center rounded-full border" style={cardStyle} aria-label="Volver"><ArrowLeft className="h-4 w-4" /></button>
            <div className="min-w-0 text-sm">
              <div className="truncate font-semibold">{chosen.map((s) => s.name).join(' + ')}</div>
              <div style={{ color: t.muted }}>{fmtDuration(totalMin)} · {ars(totalPrice)}{pro && step !== 'profesional' ? ` · ${proName(pro)}` : ''}</div>
            </div>
          </div>
        )}

        {error && <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

        {/* 1. Servicios */}
        {step === 'servicios' && (
          <>
            {biz.description && <p className="mt-4 whitespace-pre-line leading-relaxed" style={{ color: t.muted }}>{biz.description}</p>}
            {(biz.gallery?.length ?? 0) > 0 && (
              <div className="-mx-4 mt-5 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {biz.gallery!.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="shrink-0 snap-start">
                    <img src={u} alt="" loading="lazy" className="h-32 w-32 rounded-2xl object-cover sm:h-40 sm:w-40" />
                  </a>
                ))}
              </div>
            )}
            {!biz.accepting ? (
              <div className="mt-6 rounded-2xl border p-5 text-center" style={cardStyle}>
                <p className="font-semibold">Por ahora no estamos tomando reservas online.</p>
                {biz.whatsapp && <p className="mt-1 text-sm" style={{ color: t.muted }}>Escribinos por WhatsApp y te damos un turno.</p>}
              </div>
            ) : cat.services.length === 0 ? (
              <div className="mt-6 rounded-2xl border p-5 text-center text-sm" style={{ ...cardStyle, color: t.muted }}>Pronto vas a poder reservar acá.</div>
            ) : (
              <>
                <h2 className="mt-7 text-lg font-bold">¿Qué te querés hacer?</h2>
                <p className="text-sm" style={{ color: t.muted }}>Podés elegir más de uno.</p>
                <div className="mt-4 space-y-2.5">
                  {cat.services.map((s) => {
                    const on = svc.includes(s.id)
                    return (
                      <button key={s.id} onClick={() => setSvc(on ? svc.filter((x) => x !== s.id) : [...svc, s.id])}
                        className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[.99]"
                        style={{ background: on ? `${t.primary}1f` : t.card, borderColor: on ? t.primary : t.line }}>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: on ? t.primary : t.line, background: on ? t.primary : 'transparent', color: t.onPrimary }}>
                          {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{s.name}</span>
                          {s.description && <span className="block text-xs" style={{ color: t.muted }}>{s.description}</span>}
                          <span className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: t.muted }}><Clock className="h-3 w-3" /> {fmtDuration(s.duration_min)}</span>
                        </span>
                        <span className="font-bold">{ars(Number(s.price_ars))}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* 2. Profesional */}
        {step === 'profesional' && (
          <>
            <h2 className="mt-6 text-lg font-bold">¿Con quién?</h2>
            <div className="mt-4 space-y-2.5">
              {[{ id: null as string | null, name: 'Cualquiera disponible', specialty: 'Te mostramos todos los horarios' }, ...eligible].map((p) => (
                <button key={p.id ?? 'any'} onClick={() => { setPro(p.id); setStep('horario') }}
                  className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[.99]" style={cardStyle}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full font-bold" style={{ background: `${t.primary}26`, color: t.fg }}>
                    {p.id ? p.name.charAt(0).toUpperCase() : <Users className="h-5 w-5" />}
                  </span>
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    {p.specialty && <span className="block text-xs" style={{ color: t.muted }}>{p.specialty}</span>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 3. Día y horario */}
        {step === 'horario' && (
          <>
            <h2 className="mt-6 text-lg font-bold">Elegí día y horario</h2>
            <div className="mt-4"><DateStrip from={todayInTz(tz)} days={Math.min(biz.max_days_ahead + 1, 60)} value={date} onChange={setDate} t={t} /></div>
            <div className="mt-4">
              {slots === null ? (
                <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: t.primary }} /></div>
              ) : slots.length === 0 ? (
                <div className="rounded-2xl border p-6 text-center text-sm" style={{ ...cardStyle, color: t.muted }}>No quedan horarios este día. Probá con otro.</div>
              ) : (
                <SlotGrid slots={slots.map((s) => ({ t: s.t, label: hmInTz(s.t, tz) }))} value={slot} onChange={setSlot} t={t} />
              )}
            </div>
          </>
        )}

        {/* 4. Datos */}
        {step === 'datos' && slot && (
          <form id="datos" onSubmit={confirm}>
            <div className="mt-6 rounded-2xl border p-4" style={cardStyle}>
              <div className="flex items-center gap-2 text-sm font-semibold"><CalendarCheck className="h-4 w-4" style={{ color: t.primary }} /> <span className="capitalize">{longDate(ymdInTz(slot, tz))}</span> · {hmInTz(slot, tz)} hs</div>
              <div className="mt-1 text-sm" style={{ color: t.muted }}>con {proName(pro ?? slots?.find((s) => s.t === slot)?.p ?? null)}</div>
            </div>
            <h2 className="mt-6 text-lg font-bold">Tus datos</h2>
            <div className="mt-3 space-y-3">
              {[
                { k: 'name' as const, label: 'Nombre y apellido', type: 'text', ac: 'name', ph: 'Juana Pérez', req: true },
                { k: 'phone' as const, label: 'WhatsApp', type: 'tel', ac: 'tel', ph: '358 412 3456', req: true },
                { k: 'email' as const, label: 'Email (opcional)', type: 'email', ac: 'email', ph: 'vos@email.com', req: false },
              ].map((f) => (
                <label key={f.k} className="block">
                  <span className="mb-1.5 block text-sm font-medium" style={{ color: t.muted }}>{f.label}</span>
                  <input type={f.type} autoComplete={f.ac} required={f.req} maxLength={f.k === 'phone' ? 30 : 80} value={form[f.k]} placeholder={f.ph}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                    className="w-full rounded-xl border px-4 py-3.5 text-base outline-none focus:ring-2"
                    style={{ background: t.card, borderColor: t.line, color: t.fg }} />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: t.muted }}>Usamos tu WhatsApp solo para avisarte sobre este turno.</p>
          </form>
        )}

        {/* 5. Confirmado */}
        {step === 'listo' && booking && (
          <div className="pt-10 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full animate-fade-up" style={primaryBtn}><Check className="h-10 w-10" strokeWidth={3} /></div>
            <h1 className="mt-5 text-2xl font-extrabold">¡Turno confirmado!</h1>
            <p className="mt-1" style={{ color: t.muted }}>Te esperamos en {biz.name}</p>
            <div className="mt-6 rounded-2xl border p-5 text-left" style={cardStyle}>
              <div className="text-lg font-bold capitalize">{longDate(ymdInTz(booking.starts_at, tz))}</div>
              <div className="text-3xl font-extrabold" style={{ color: t.primary }}>{hmInTz(booking.starts_at, tz)} hs</div>
              <div className="mt-3 text-sm">{booking.services.map((s) => s.name).join(' + ')} con <b>{booking.professional.name}</b></div>
              <div className="mt-1 text-sm" style={{ color: t.muted }}>Total estimado: {ars(Number(booking.total_price))}</div>
              {address && <div className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: t.muted }}><MapPin className="h-3.5 w-3.5" /> {address}</div>}
            </div>
            <div className="mt-4 grid gap-2.5">
              {biz.whatsapp && (
                <a className="flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-semibold text-white" style={{ background: '#25D366' }} target="_blank" rel="noreferrer"
                  href={waLink(msgClientToBusiness({ businessName: biz.name, clientName: form.name, startsAt: booking.starts_at, tz, services: booking.services.map((s) => s.name).join(' + '), professional: booking.professional.name }), biz.whatsapp)}>
                  <MessageCircle className="h-5 w-5" /> Avisarle al negocio por WhatsApp
                </a>
              )}
              <a className="flex items-center justify-center gap-2 rounded-2xl border px-5 py-3.5 font-semibold" style={cardStyle} target="_blank" rel="noreferrer"
                href={googleCalendarUrl(`Turno en ${biz.name}`, booking.starts_at, booking.ends_at, `${booking.services.map((s) => s.name).join(' + ')} con ${booking.professional.name}\nCambiar o cancelar: ${manageUrl(booking.token)}`, address)}>
                <CalendarPlus className="h-5 w-5" /> Agregar a mi calendario
              </a>
              <Link to={`/turno/${booking.token}`} className="flex items-center justify-center gap-2 rounded-2xl border px-5 py-3.5 font-semibold" style={cardStyle}>
                <ExternalLink className="h-5 w-5" /> Ver, cambiar o cancelar mi turno
              </Link>
            </div>
            <p className="mt-4 text-xs" style={{ color: t.muted }}>Guardá este link para gestionar tu turno. Podés cambiarlo o cancelarlo hasta {biz.cancel_limit_hours ? `${biz.cancel_limit_hours} h antes` : 'la hora del turno'}.</p>
            <button className="mt-6 text-sm font-semibold underline" onClick={() => { setStep('servicios'); setSvc([]); setPro(null); setSlot(null); setBooking(null) }}>Sacar otro turno</button>
          </div>
        )}

        {/* Contacto */}
        {(step === 'servicios' || step === 'listo') && (
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {biz.whatsapp && step === 'servicios' && (
              <a href={waLink(`Hola ${biz.name}! Tengo una consulta.`, biz.whatsapp)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold" style={cardStyle}>
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
            {ig && <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="grid h-11 w-11 place-items-center rounded-full border" style={cardStyle} aria-label="Instagram"><Instagram className="h-5 w-5" /></a>}
            {fb && <a href={`https://facebook.com/${fb}`} target="_blank" rel="noreferrer" className="grid h-11 w-11 place-items-center rounded-full border" style={cardStyle} aria-label="Facebook"><Facebook className="h-5 w-5" /></a>}
          </div>
        )}
        <p className="mt-10 text-center text-xs" style={{ color: t.muted }}>Turnos con <Link to="/" className="font-semibold underline">VOLT Turnos</Link> ⚡</p>
      </div>

      {/* Barra inferior de acción */}
      {(step === 'servicios' && svc.length > 0) || (step === 'horario' && slot) || step === 'datos' ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur" style={{ background: `${t.bg}e6`, borderColor: t.line }}>
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              {step === 'horario' && slot ? <><b>{hmInTz(slot, tz)} hs</b><div className="capitalize" style={{ color: t.muted }}>{longDate(date)}</div></>
                : <><b>{ars(totalPrice)}</b><div style={{ color: t.muted }}>{fmtDuration(totalMin)}</div></>}
            </div>
            {step === 'servicios' && <button onClick={next} className="rounded-2xl px-6 py-3.5 font-bold" style={primaryBtn}>Continuar</button>}
            {step === 'horario' && <button onClick={() => { setError(''); setStep('datos') }} className="rounded-2xl px-6 py-3.5 font-bold" style={primaryBtn}>Continuar</button>}
            {step === 'datos' && (
              <button form="datos" disabled={busy} className="flex items-center gap-2 rounded-2xl px-6 py-3.5 font-bold disabled:opacity-60" style={primaryBtn}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar turno
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
