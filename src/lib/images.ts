import { supabase } from './supabase'

/** Achica y comprime una imagen en el navegador (webp) antes de subirla */
export async function compressImage(file: File, maxSide: number, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('No se pudo leer la imagen'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality))
    if (!blob) throw new Error('No se pudo procesar la imagen')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Sube a business-assets/{businessId}/{kind}-{timestamp}.webp y devuelve la URL pública */
export async function uploadBusinessImage(businessId: string, file: File, kind: 'logo' | 'cover' | 'foto'): Promise<string> {
  const max = kind === 'logo' ? 512 : kind === 'cover' ? 1600 : 1200
  const blob = await compressImage(file, max)
  const path = `${businessId}/${kind}-${Date.now()}.webp`
  const { error } = await supabase.storage.from('business-assets').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (error) throw error
  return supabase.storage.from('business-assets').getPublicUrl(path).data.publicUrl
}

/** Borra un archivo propio a partir de su URL pública (si es del bucket) */
export async function removeBusinessImage(publicUrl: string | null) {
  if (!publicUrl) return
  const marker = '/object/public/business-assets/'
  const i = publicUrl.indexOf(marker)
  if (i < 0) return
  await supabase.storage.from('business-assets').remove([publicUrl.slice(i + marker.length)])
}
