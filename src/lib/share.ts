/** Normaliza un número argentino para wa.me (549 + característica + número) */
export function waNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('9')) d = d.slice(1)
  if (d.startsWith('0')) d = d.slice(1)
  // quita el "15" después de la característica (ej: 358 15 1234567)
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')
  if (d.length !== 10) return null
  return `549${d}`
}

/** Link de WhatsApp con texto correctamente codificado. Sin número abre el selector de contactos. */
export function waLink(text: string, phone?: string | null): string {
  const n = waNumber(phone ?? null)
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const publicUrl = (slug: string) => `${window.location.origin}/${slug}`
