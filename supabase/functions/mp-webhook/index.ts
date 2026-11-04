// Notificaciones de Mercado Pago (suscripciones). Nunca confiamos en el cuerpo:
// siempre volvemos a consultar a Mercado Pago con nuestro token antes de tocar la base.
// Las suscripciones de VOLT Presupuestos (referencia "vp:") se reenvían a su propio webhook.
import { admin, mp } from '../_shared/mp.ts'

const PRESU_WEBHOOK = Deno.env.get('PRESU_WEBHOOK_URL') ?? 'https://gnksbrieykexgngpmdiv.supabase.co/functions/v1/mp-webhook'
const ok = () => new Response('ok', { status: 200 })

async function forward(req: Request, raw: string) {
  const url = new URL(req.url)
  await fetch(PRESU_WEBHOOK + url.search, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw || '{}' })
}

async function handlePreapproval(id: string) {
  const pre = await mp(`/preapproval/${id}`)
  const ref: string = pre.external_reference ?? ''
  if (!ref.startsWith('vt:')) return ref.startsWith('vp:') ? 'forward' : 'ignore'
  const [, businessId, planId] = ref.split(':')
  const db = admin()
  const { data: sub } = await db.from('subscriptions').select('*').eq('business_id', businessId).maybeSingle()
  if (!sub) return 'ignore'

  const status = pre.status as string
  if (status === 'authorized') {
    // Si había otro débito autorizado (cambio de plan), lo damos de baja
    if (sub.mp_preapproval_id && sub.mp_preapproval_id !== id && sub.mp_status === 'authorized') {
      try { await mp(`/preapproval/${sub.mp_preapproval_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }) } catch (e) { console.error('cancel old', (e as Error).message) }
    }
    const patch: Record<string, unknown> = { mp_preapproval_id: id, mp_status: 'authorized', mp_plan_id: planId, mp_payer_email: pre.payer_email ?? sub.mp_payer_email, cancel_at_period_end: false }
    // Fuera de la prueba y sin días pagos: 2 días de gracia mientras llega el primer cobro
    const inTrial = sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()
    const paid = sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) > new Date()
    if (!inTrial && !paid) {
      patch.status = 'active'; patch.plan_id = planId
      patch.current_period_start = new Date().toISOString()
      patch.current_period_end = new Date(Date.now() + 2 * 86400000).toISOString()
    }
    await db.from('subscriptions').update(patch).eq('business_id', businessId)
  } else if (id === sub.mp_preapproval_id) {
    await db.from('subscriptions').update({
      mp_status: status === 'cancelled' ? 'cancelled' : status === 'paused' ? 'paused' : 'pending',
      cancel_at_period_end: status === 'cancelled' || status === 'paused',
    }).eq('business_id', businessId)
  }
  return 'done'
}

async function handleAuthorizedPayment(id: string) {
  const ap = await mp(`/authorized_payments/${id}`)
  const pre = await mp(`/preapproval/${ap.preapproval_id}`)
  const ref: string = pre.external_reference ?? ''
  if (!ref.startsWith('vt:')) return ref.startsWith('vp:') ? 'forward' : 'ignore'
  const [, businessId, planId] = ref.split(':')
  const paymentOk = ap.payment?.status === 'approved' || (ap.status === 'processed' && !ap.payment?.status)
  if (!paymentOk || !ap.payment?.id) return 'pending'
  const { error } = await admin().rpc('mp_apply_payment', { p_business: businessId, p_plan: planId, p_payment_id: String(ap.payment.id), p_amount: Number(ap.transaction_amount) })
  if (error) throw new Error(error.message)
  return 'paid'
}

Deno.serve(async (req) => {
  if (req.method === 'GET') return ok() // verificación de Mercado Pago
  const raw = await req.text()
  let body: any = {}
  try { body = raw ? JSON.parse(raw) : {} } catch { /* puede venir vacío */ }
  const url = new URL(req.url)
  const type = String(body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  const id = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')
  if (!id) return ok()
  try {
    let r = 'ignore'
    if (type.includes('preapproval')) r = await handlePreapproval(id)
    else if (type.includes('authorized_payment')) r = await handleAuthorizedPayment(id)
    if (r === 'forward') await forward(req, raw)
    console.log('mp-webhook', type, id, r)
    return ok()
  } catch (e) {
    const err = e as Error
    if (err.message === 'MP_NOT_CONFIGURED') return ok()
    console.error('mp-webhook error', type, id, err.message)
    return new Response('error', { status: 500 }) // Mercado Pago reintenta
  }
})
