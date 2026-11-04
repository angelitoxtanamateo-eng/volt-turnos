// Fechas y horas siempre en la zona horaria del negocio (no la del celular)

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "YYYY-MM-DD" de un instante, en la zona tz */
export function ymdInTz(d: Date | string, tz: string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function todayInTz(tz: string): string {
  return ymdInTz(new Date(), tz)
}

/** "HH:mm" de un instante, en la zona tz */
export function hmInTz(d: Date | string, tz: string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

/** Minutos desde medianoche (zona tz) */
export function minutesInTz(d: Date | string, tz: string): number {
  const [h, m] = hmInTz(d, tz).split(':').map(Number)
  return h * 60 + m
}

function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return (asUtc - date.getTime()) / 60000
}

/** Convierte fecha + hora locales del negocio a un instante (ISO UTC) */
export function zonedToIso(ymd: string, hm: string, tz: string): string {
  const [y, mo, d] = ymd.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi))
  const off1 = tzOffsetMinutes(guess, tz)
  let t = guess.getTime() - off1 * 60000
  const off2 = tzOffsetMinutes(new Date(t), tz)
  if (off2 !== off1) t = guess.getTime() - off2 * 60000
  return new Date(t).toISOString()
}

/** Suma días a "YYYY-MM-DD" */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** Día de la semana (0 = domingo) de "YYYY-MM-DD" */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Lunes de la semana de ymd */
export function startOfWeek(ymd: string): string {
  const wd = weekdayOf(ymd)
  return addDays(ymd, wd === 0 ? -6 : 1 - wd)
}

export function startOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + '01'
}

export function daysInMonth(ymd: string): number {
  const [y, m] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addMonths(ymd: string, n: number): string {
  const [y, m] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return dt.toISOString().slice(0, 10)
}

/** "jueves 5 de noviembre" */
export function longDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `${WEEKDAYS[weekdayOf(ymd)].toLowerCase()} ${d} de ${MONTHS[m - 1]}`
}

/** "Jue 5" */
export function shortDate(ymd: string): string {
  return `${WEEKDAYS_SHORT[weekdayOf(ymd)]} ${Number(ymd.slice(8, 10))}`
}

export function monthLabel(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number)
  return `${MONTHS[m - 1].charAt(0).toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`
}

/** Rango [inicio, fin) en ISO para consultar días locales */
export function dayRangeIso(fromYmd: string, toYmdExclusive: string, tz: string): [string, string] {
  return [zonedToIso(fromYmd, '00:00', tz), zonedToIso(toYmdExclusive, '00:00', tz)]
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "09:00:00" -> "09:00" */
export const hhmm = (t: string) => t.slice(0, 5)
