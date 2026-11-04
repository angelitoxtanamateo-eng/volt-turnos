import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, MessageCircle, Instagram, Facebook, CalendarPlus, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { FullScreenLoader, Logo } from '../components/ui'
import { waLink } from '../lib/share'
import type { Business } from '../lib/types'

type PublicBiz = Pick<Business, 'id' | 'slug' | 'name' | 'category' | 'description' | 'logo_url' | 'cover_url' | 'template' | 'primary_color' | 'secondary_color' | 'background_color' | 'socials' | 'phone' | 'whatsapp' | 'address' | 'city' | 'is_published'>

/** Elige texto blanco o negro según el fondo */
function readable(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#FFFFFF'
}

export default function PublicBusiness() {
  const { slug = '' } = useParams()
  const [biz, setBiz] = useState<PublicBiz | null | undefined>(undefined)

  useEffect(() => {
    supabase.rpc('get_public_business', { p_slug: slug }).then(({ data }) => setBiz((data as PublicBiz) ?? null))
  }, [slug])

  useEffect(() => { if (biz) document.title = `${biz.name} · Reservá tu turno` }, [biz])

  if (biz === undefined) return <FullScreenLoader />
  if (biz === null) {
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

  const bg = biz.background_color
  const fg = readable(bg)
  const onPrimary = readable(biz.primary_color)
  const muted = fg === '#FFFFFF' ? 'rgba(255,255,255,.65)' : 'rgba(17,24,39,.6)'
  const ig = biz.socials?.instagram
  const fb = biz.socials?.facebook

  return (
    <div className="min-h-[100dvh]" style={{ background: bg, color: fg }}>
      {!biz.is_published && (
        <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black">
          <EyeOff className="h-4 w-4" /> Vista previa: tu página todavía no está publicada
        </div>
      )}
      <div className="relative h-44 sm:h-56" style={{ background: biz.cover_url ? `url(${biz.cover_url}) center/cover` : `linear-gradient(135deg, ${biz.primary_color}, ${biz.secondary_color})` }} />
      <div className="mx-auto -mt-12 max-w-xl px-4 pb-16">
        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl border-4 text-3xl font-extrabold shadow-xl"
          style={{ borderColor: bg, background: biz.primary_color, color: onPrimary }}>
          {biz.logo_url ? <img src={biz.logo_url} alt={biz.name} className="h-full w-full object-cover" /> : biz.name.charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{biz.name}</h1>
        {(biz.address || biz.city) && (
          <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: muted }}>
            <MapPin className="h-4 w-4" /> {[biz.address, biz.city].filter(Boolean).join(', ')}
          </p>
        )}
        {biz.description && <p className="mt-4 whitespace-pre-line leading-relaxed" style={{ color: muted }}>{biz.description}</p>}

        <button disabled className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-bold opacity-60"
          style={{ background: biz.primary_color, color: onPrimary }}>
          <CalendarPlus className="h-5 w-5" /> Reservas online muy pronto
        </button>

        <div className="mt-3 grid gap-2">
          {biz.whatsapp && (
            <a href={waLink(`Hola ${biz.name}! Quiero sacar un turno.`, biz.whatsapp)} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl border px-5 py-3.5 font-semibold" style={{ borderColor: `${biz.primary_color}66` }}>
              <MessageCircle className="h-5 w-5" /> Escribir por WhatsApp
            </a>
          )}
          <div className="flex justify-center gap-3 pt-2">
            {ig && <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="rounded-full p-3" style={{ background: `${biz.primary_color}22` }} aria-label="Instagram"><Instagram className="h-5 w-5" /></a>}
            {fb && <a href={`https://facebook.com/${fb}`} target="_blank" rel="noreferrer" className="rounded-full p-3" style={{ background: `${biz.primary_color}22` }} aria-label="Facebook"><Facebook className="h-5 w-5" /></a>}
          </div>
        </div>

        <p className="mt-14 text-center text-xs" style={{ color: muted }}>
          Turnos con <Link to="/" className="font-semibold underline">VOLT Turnos</Link> ⚡
        </p>
      </div>
    </div>
  )
}
