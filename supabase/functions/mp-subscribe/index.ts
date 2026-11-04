// Crea el débito automático mensual (preapproval de Mercado Pago) y devuelve el link para autorizarlo
import { admin, APP_URL, asUser, cors, json, mp } from '../_shared/mp.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  try {
    const { business_id, plan_id, payer_email } = await req.json()
    if (!business_id || !plan_id) return json({ error: 'Faltan datos' }, 400)

    const user = asUser(req)
    const { data: u } = await user.auth.getUser()
    if (!u?.user) return json({ error: 'Tenés que iniciar sesión' }, 401)
    const { data: allowed } = await user.rpc('has_business_role', { p_business: business_id, p_roles: ['owner', 'admin'] })
    if (!allowed) return json({ error: 'Solo el dueño o un administrador puede activar el débito' }, 403)

    const db = admin()
    const [{ data: plan }, { data: biz }, { data: sub }] = await Promise.all([
      db.from('plans').select('id, code, name, price_ars, is_active').eq('id', plan_id).maybeSingle(),
      db.from('businesses').select('id, name').eq('id', business_id).maybeSingle(),
      db.from('subscriptions').select('*').eq('business_id', business_id).maybeSingle(),
    ])
    if (!plan?.is_active || !biz || !sub) return json({ error: 'Plan no disponible' }, 400)
    if (sub.mp_status === 'authorized' && sub.mp_plan_id === plan.id) return json({ error: 'Ya tenés el débito automático activo en este plan' }, 409)

    const email = String(payer_email || u.user.email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Ingresá el email de tu cuenta de Mercado Pago' }, 400)

    // Si está en prueba, el primer débito se hace cuando termina la prueba
    const trialEnd = sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date() ? sub.trial_ends_at : null
    const paidUntil = sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) > new Date() ? sub.current_period_end : null
    const startDate = paidUntil ?? trialEnd

    const pre = await mp('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `VOLT Turnos ${plan.name} · ${biz.name}`.slice(0, 120),
        external_reference: `vt:${business_id}:${plan.id}`,
        payer_email: email,
        back_url: `${APP_URL()}/panel/plan?mp=ok`,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: Number(plan.price_ars),
          currency_id: 'ARS',
          ...(startDate ? { start_date: new Date(startDate).toISOString() } : {}),
        },
      }),
    })

    // Solo pisamos el id si no hay otro débito ya autorizado (ese se reemplaza cuando el nuevo se autorice)
    if (sub.mp_status !== 'authorized') {
      await db.from('subscriptions').update({ mp_preapproval_id: pre.id, mp_status: 'pending', mp_plan_id: plan.id, mp_payer_email: email }).eq('business_id', business_id)
    }
    return json({ init_point: pre.init_point, id: pre.id })
  } catch (e) {
    const err = e as Error & { status?: number }
    if (err.message === 'MP_NOT_CONFIGURED') return json({ error: 'El débito automático todavía no está habilitado. Usá el pago con link.' }, 503)
    console.error('mp-subscribe', err.message, (err as any).detail)
    return json({ error: err.message || 'No se pudo crear el débito' }, err.status && err.status < 500 ? 400 : 500)
  }
})
