import { useEffect, useRef } from 'react'
import { WEEKDAYS_SHORT, MONTHS, addDays, weekdayOf } from '../lib/time'

/** Texto blanco o negro según el fondo */
export function readable(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#FFFFFF'
}

export interface Theme { bg: string; fg: string; muted: string; primary: string; onPrimary: string; card: string; line: string }

export function makeTheme(primary: string, background: string): Theme {
  const fg = readable(background)
  const dark = fg === '#FFFFFF'
  return {
    bg: background, fg, primary, onPrimary: readable(primary),
    muted: dark ? 'rgba(255,255,255,.62)' : 'rgba(17,24,39,.58)',
    card: dark ? 'rgba(255,255,255,.06)' : 'rgba(17,24,39,.04)',
    line: dark ? 'rgba(255,255,255,.12)' : 'rgba(17,24,39,.1)',
  }
}

/** Tira horizontal de días */
export function DateStrip({ from, days, value, onChange, t }: { from: string; days: number; value: string; onChange: (d: string) => void; t: Theme }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('[data-active="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [value])
  return (
    <div ref={ref} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {Array.from({ length: days }, (_, i) => {
        const d = addDays(from, i)
        const active = d === value
        const dayNum = Number(d.slice(8))
        return (
          <button key={d} data-active={active} onClick={() => onChange(d)}
            className="flex w-[58px] shrink-0 flex-col items-center rounded-2xl border py-2.5 transition"
            style={{ background: active ? t.primary : t.card, color: active ? t.onPrimary : t.fg, borderColor: active ? t.primary : t.line }}>
            <span className="text-[11px] font-semibold uppercase opacity-80">{i === 0 ? 'Hoy' : i === 1 ? 'Mañ' : WEEKDAYS_SHORT[weekdayOf(d)]}</span>
            <span className="text-xl font-bold leading-tight">{dayNum}</span>
            <span className="text-[10px] opacity-70">{dayNum === 1 || i === 0 ? MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3) : ' '}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Grilla de horarios agrupada por mañana / tarde / noche */
export function SlotGrid({ slots, value, onChange, t }: { slots: { t: string; label: string }[]; value: string | null; onChange: (iso: string) => void; t: Theme }) {
  const groups: [string, (h: number) => boolean][] = [['Mañana', (h) => h < 13], ['Tarde', (h) => h >= 13 && h < 19], ['Noche', (h) => h >= 19]]
  return (
    <div className="space-y-4">
      {groups.map(([name, fn]) => {
        const list = slots.filter((s) => fn(Number(s.label.slice(0, 2))))
        if (!list.length) return null
        return (
          <div key={name}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: t.muted }}>{name}</div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {list.map((s) => {
                const active = s.t === value
                return (
                  <button key={s.t} onClick={() => onChange(s.t)} className="rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95"
                    style={{ background: active ? t.primary : t.card, color: active ? t.onPrimary : t.fg, borderColor: active ? t.primary : t.line }}>
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Link "Agregar a Google Calendar" */
export function googleCalendarUrl(title: string, startIso: string, endIso: string, details: string, location: string) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const p = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${f(startIso)}/${f(endIso)}`, details, location })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
