// Cancela el débito automático. El plan sigue activo hasta la fecha ya pagada.
import { admin, asUser, cors, json, mp } from '../_shared/mp.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  try {
    const { business_id } = await req.json()
    const user = asUser(req)
    const { data: u } = await user.auth.getUser()
    if (!u?.user) return json({ error: 'Tenés que iniciar sesión' }, 401)
    const { data: allowed } = await user.rpc('has_business_role', { p_business: business_id, p_roles: ['owner', 'admin'] })
    if (!allowed) return json({ error: 'Sin permiso' }, 403)

    const db = admin()
    const { data: sub } = await db.from('subscriptions').select('mp_preapproval_id, mp_status').eq('business_id', business_id).maybeSingle()
    if (!sub?.mp_preapproval_id) return json({ error: 'No tenés débito automático' }, 400)
    await mp(`/preapproval/${sub.mp_preapproval_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) })
    await db.from('subscriptions').update({ mp_status: 'cancelled', cancel_at_period_end: true }).eq('business_id', business_id)
    return json({ ok: true })
  } catch (e) {
    const err = e as Error & { status?: number }
    if (err.message === 'MP_NOT_CONFIGURED') return json({ error: 'Mercado Pago no está configurado' }, 503)
    console.error('mp-cancel', err.message)
    return json({ error: err.message }, 500)
  }
})
