import { hmInTz, longDate, ymdInTz } from './time'

interface Ctx {
  businessName: string
  clientName: string
  startsAt: string
  tz: string
  services: string
  professional: string
  address?: string | null
  manageUrl?: string
}

const first = (n: string) => n.trim().split(/\s+/)[0]
const when = (c: Ctx) => `el ${longDate(ymdInTz(c.startsAt, c.tz))} a las ${hmInTz(c.startsAt, c.tz)}`

export const manageUrl = (token: string) => `${window.location.origin}/turno/${token}`

export const msgConfirm = (c: Ctx) =>
  `¡Hola ${first(c.clientName)}! 👋 Tu turno en *${c.businessName}* quedó confirmado ${when(c)}.\n` +
  `✂️ ${c.services} con ${c.professional}` +
  (c.address ? `\n📍 ${c.address}` : '') +
  (c.manageUrl ? `\n\nSi necesitás cambiarlo o cancelarlo: ${c.manageUrl}` : '')

export const msgReminder = (c: Ctx) =>
  `¡Hola ${first(c.clientName)}! Te recordamos tu turno en *${c.businessName}* ${when(c)} (${c.services}). ¡Te esperamos! 🙌` +
  (c.manageUrl ? `\n\nSi no podés venir, avisanos acá: ${c.manageUrl}` : '')

export const msgCancel = (c: Ctx) =>
  `Hola ${first(c.clientName)}, te avisamos que tu turno en *${c.businessName}* ${when(c)} quedó cancelado. Si querés, respondé este mensaje y te damos otro horario.`

export const msgReschedule = (c: Ctx) =>
  `Hola ${first(c.clientName)}, tu turno en *${c.businessName}* se cambió para ${when(c)} con ${c.professional}.` +
  (c.manageUrl ? `\n\nDetalle: ${c.manageUrl}` : '')

/** Mensaje que manda el cliente al negocio después de reservar */
export const msgClientToBusiness = (c: Ctx) =>
  `Hola! Soy ${c.clientName}. Acabo de reservar ${c.services} ${when(c)} con ${c.professional}.`
