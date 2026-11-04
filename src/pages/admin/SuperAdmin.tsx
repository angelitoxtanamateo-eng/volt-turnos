import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CircleDollarSign, FlaskConical, PauseCircle, PlayCircle, Search, ShieldCheck, ArrowLeft, Save } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Logo, PageHeader, Spinner, StatCard } from '../../components/ui'
import { CATEGORIES, SUB_STATUS, ars, fmtDate, type Plan, type PlanInfo } from '../../lib/types'

interface Row {
  id: string; slug: string; name: string; category: string; status: 'active' | 'suspended'; is_published: boolean; created_at: string; city: string | null
  subscriptions: { status: PlanInfo['status']; trial_ends_at: string | null; current_period_end: string | null; plans: { name: string; price_ars: number } | null } | null
}

interface SubPay {
  id: string; business_id: string; months: number; amount: number; reference: string; payer_note: string | null
  status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string; period_end: string | null
  plans: { name: string } | null; businesses: { name: string; slug: string } | null
}

export default function SuperAdmin() {
  const { signOut, memberships } = useAuth()
  const [tab, setTab] = useState<'negocios' | 'pagos' | 'planes' | 'ajustes'>('negocios')
  const [pays, setPays] = useState<SubPay[]>([])
  const [mpLink, setMpLink] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [trialDays, setTrialDays] = useState('14')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async () => {
    const [b, p, s, sp, ml] = await Promise.all([
      supabase.from('businesses')
        .select('id, slug, name, category, status, is_published, created_at, city, subscriptions(status, trial_ends_at, current_period_end, plans(name, price_ars))')
        .order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('sort_order'),
      supabase.from('platform_settings').select('value').eq('key', 'trial_days').maybeSingle(),
      supabase.from('subscription_payments').select('id, business_id, months, amount, reference, payer_note, status, admin_note, created_at, period_end, plans(name), businesses(name, slug)')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('platform_settings').select('value').eq('key', 'mp_payment_link').maybeSingle(),
    ])
    setPays((sp.data ?? []) as unknown as SubPay[])
    if (ml.data) setMpLink(String(ml.data.value))
    if (b.error) setError(errorMessage(b.error))
    setRows((b.data ?? []) as unknown as Row[])
    setPlans((p.data ?? []) as Plan[])
    if (s.data) setTrialDays(String(s.data.value))
  }, [])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => {
    const list = rows ?? []
    const mrr = list.reduce((acc, r) => acc + (r.subscriptions?.status === 'active' && r.status === 'active' ? Number(r.subscriptions.plans?.price_ars ?? 0) : 0), 0)
    return {
      total: list.length,
      paying: list.filter((r) => r.subscriptions?.status === 'active').length,
      trial: list.filter((r) => r.subscriptions?.status === 'trialing').length,
      suspended: list.filter((r) => r.status === 'suspended').length,
      mrr,
    }
  }, [rows])

  const filtered = (rows ?? []).filter((r) => !q || `${r.name} ${r.slug} ${r.city ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  async function setStatus(r: Row, status: 'active' | 'suspended') {
    if (status === 'suspended' && !confirm(`¿Suspender ${r.name}? Su página y su panel dejan de funcionar.`)) return
    const { error } = await supabase.from('businesses').update({ status }).eq('id', r.id)
    if (error) return setError(errorMessage(error))
    setRows((v) => v?.map((x) => (x.id === r.id ? { ...x, status } : x)) ?? null)
  }

  async function savePlan(p: Plan) {
    setError(''); setOk('')
    const { error } = await supabase.from('plans').update({
      price_ars: Number(p.price_ars), max_professionals: p.max_professionals, is_active: p.is_active, description: p.description,
    }).eq('id', p.id)
    if (error) return setError(errorMessage(error))
    setOk(`Plan ${p.name} actualizado`)
  }

  async function saveTrial() {
    setError(''); setOk('')
    const n = parseInt(trialDays, 10)
    if (!Number.isFinite(n) || n < 0 || n > 90) return setError('Los días de prueba deben estar entre 0 y 90')
    const { error } = await supabase.from('platform_settings').update({ value: n }).eq('key', 'trial_days')
    if (error) return setError(errorMessage(error))
    setOk('Período de prueba actualizado (aplica a negocios nuevos)')
  }

  async function review(pay: SubPay, approve: boolean) {
    setError(''); setOk('')
    let note: string | null = null
    if (!approve) {
      note = prompt('Motivo del rechazo (lo ve el negocio):', 'No encontramos el pago con ese número de operación')
      if (note === null) return
    } else if (!confirm(`¿Confirmás que recibiste ${ars(Number(pay.amount))} de ${pay.businesses?.name} (operación ${pay.reference})?`)) return
    const { error } = await supabase.rpc('review_subscription_payment', { p_id: pay.id, p_approve: approve, p_note: note })
    if (error) return setError(errorMessage(error))
    setOk(approve ? `Plan activado para ${pay.businesses?.name}` : 'Pago rechazado')
    load()
  }

  async function saveLink() {
    setError(''); setOk('')
    if (!/^https:\/\/(link\.)?mercadopago\.com(\.ar)?\//.test(mpLink.trim())) return setError('Pegá un link de Mercado Pago válido (https://link.mercadopago.com.ar/...)')
    const { error } = await supabase.from('platform_settings').update({ value: mpLink.trim() }).eq('key', 'mp_payment_link')
    if (error) return setError(errorMessage(error))
    setOk('Link de cobro actualizado')
  }

  const pendingPays = pays.filter((x) => x.status === 'pending')

  const catLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-volt-line bg-volt-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" to="/superadmin" />
            <span className="chip bg-volt-violet/15 text-volt-violet2"><ShieldCheck className="h-3.5 w-3.5" /> Superadmin</span>
          </div>
          <div className="flex items-center gap-2">
            {memberships.length > 0 && <Link to="/panel" className="btn-ghost py-2 text-sm"><ArrowLeft className="h-4 w-4" /> Mi panel</Link>}
            <button onClick={() => signOut()} className="btn-ghost py-2 text-sm">Salir</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader title="Panel VOLT" subtitle="Todos los negocios de la plataforma" />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Negocios" value={rows ? stats.total : '…'} icon={<Building2 className="h-4 w-4" />} note={`${stats.suspended} suspendidos`} />
          <StatCard label="En prueba" value={rows ? stats.trial : '…'} icon={<FlaskConical className="h-4 w-4" />} />
          <StatCard label="Pagando" value={rows ? stats.paying : '…'} icon={<PlayCircle className="h-4 w-4" />} />
          <StatCard label="Ingreso mensual" value={rows ? ars(stats.mrr) : '…'} icon={<CircleDollarSign className="h-4 w-4" />} note="Suscripciones activas" />
        </div>

        <div className="mt-6 flex gap-1 rounded-xl border border-volt-line bg-volt-card p-1 text-sm sm:w-fit">
          {(['negocios', 'pagos', 'planes', 'ajustes'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`relative flex-1 rounded-lg px-3 py-2 font-semibold capitalize transition ${tab === t ? 'bg-volt-violet text-white' : 'text-volt-muted hover:text-volt-white'}`}>
              {t}
              {t === 'pagos' && pendingPays.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-volt-amber px-1 text-[11px] font-bold text-black">{pendingPays.length}</span>}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {error && <Alert>{error}</Alert>}
          {ok && <Alert kind="success">{ok}</Alert>}
        </div>

        {tab === 'negocios' && (
          <section className="mt-4">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-volt-muted" />
              <input className="input pl-10" placeholder="Buscar por nombre, dirección o ciudad" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!rows ? (
              <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
            ) : filtered.length === 0 ? (
              <div className="card p-8 text-center text-sm text-volt-muted">Todavía no hay negocios registrados.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => {
                  const sub = r.subscriptions
                  return (
                    <div key={r.id} className="card flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r.name}</span>
                          {r.status === 'suspended' && <span className="chip bg-volt-red/15 text-volt-red">Suspendido</span>}
                          {!r.is_published && <span className="chip bg-white/5 text-volt-muted">Sin publicar</span>}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-volt-muted">/{r.slug} · {catLabel(r.category)}{r.city ? ` · ${r.city}` : ''} · alta {fmtDate(r.created_at)}</div>
                      </div>
                      {sub && (
                        <div className="text-right text-xs">
                          <span className={`chip ${SUB_STATUS[sub.status].cls}`}>{sub.plans?.name} · {SUB_STATUS[sub.status].label}</span>
                          <div className="mt-1 text-volt-muted">{sub.status === 'trialing' ? `Prueba hasta ${fmtDate(sub.trial_ends_at)}` : sub.current_period_end ? `Vence ${fmtDate(sub.current_period_end)}` : ''}</div>
                        </div>
                      )}
                      {r.status === 'active' ? (
                        <button onClick={() => setStatus(r, 'suspended')} className="btn-danger py-2 text-sm"><PauseCircle className="h-4 w-4" /> Suspender</button>
                      ) : (
                        <button onClick={() => setStatus(r, 'active')} className="btn-ghost py-2 text-sm text-volt-green"><PlayCircle className="h-4 w-4" /> Reactivar</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'pagos' && (
          <section className="mt-4 space-y-2">
            {pays.length === 0 && <div className="card p-8 text-center text-sm text-volt-muted">Todavía no hay pagos informados.</div>}
            {pays.map((x) => (
              <div key={x.id} className={`card flex flex-wrap items-center gap-3 p-4 ${x.status === 'pending' ? 'border-volt-amber/40' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{x.businesses?.name}</span>
                    <span className={`chip ${x.status === 'pending' ? 'bg-volt-amber/15 text-volt-amber' : x.status === 'approved' ? 'bg-volt-green/15 text-volt-green' : 'bg-volt-red/15 text-volt-red'}`}>
                      {x.status === 'pending' ? 'Por verificar' : x.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-volt-muted">
                    Plan {x.plans?.name} · {x.months} {x.months === 1 ? 'mes' : 'meses'} · {fmtDate(x.created_at)} · operación <b className="text-volt-white">{x.reference}</b>
                    {x.period_end && ` · hasta ${fmtDate(x.period_end)}`}
                  </div>
                  {x.payer_note && <div className="mt-1 text-xs text-volt-muted">💬 {x.payer_note}</div>}
                </div>
                <div className="text-lg font-bold">{ars(Number(x.amount))}</div>
                {x.status === 'pending' && (
                  <div className="flex gap-2">
                    <button className="btn-danger py-2 text-sm" onClick={() => review(x, false)}>Rechazar</button>
                    <button className="btn-primary bg-volt-green py-2 text-sm hover:bg-green-500" onClick={() => review(x, true)}>Aprobar</button>
                  </div>
                )}
              </div>
            ))}
            <p className="pt-2 text-xs text-volt-muted">Antes de aprobar, buscá el número de operación en tu actividad de Mercado Pago y verificá el monto.</p>
          </section>
        )}

        {tab === 'planes' && (
          <section className="mt-4 grid gap-4 md:grid-cols-3">
            {plans.map((p, i) => (
              <div key={p.id} className="card space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.name}</span>
                  <label className="flex items-center gap-2 text-xs text-volt-muted">
                    <input type="checkbox" checked={p.is_active} onChange={(e) => setPlans((v) => v.map((x, j) => (j === i ? { ...x, is_active: e.target.checked } : x)))} /> Activo
                  </label>
                </div>
                <label className="block"><span className="label">Precio mensual (ARS)</span>
                  <input className="input" type="number" min={0} step={10} value={p.price_ars} onChange={(e) => setPlans((v) => v.map((x, j) => (j === i ? { ...x, price_ars: Number(e.target.value) } : x)))} />
                </label>
                <label className="block"><span className="label">Máx. profesionales (vacío = ilimitado)</span>
                  <input className="input" type="number" min={1} value={p.max_professionals ?? ''} onChange={(e) => setPlans((v) => v.map((x, j) => (j === i ? { ...x, max_professionals: e.target.value ? Number(e.target.value) : null } : x)))} />
                </label>
                <label className="block"><span className="label">Descripción</span>
                  <input className="input" value={p.description ?? ''} onChange={(e) => setPlans((v) => v.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                </label>
                <button className="btn-primary w-full" onClick={() => savePlan(p)}><Save className="h-4 w-4" /> Guardar</button>
              </div>
            ))}
          </section>
        )}

        {tab === 'ajustes' && (
          <section className="card mt-4 max-w-md space-y-3 p-5">
            <label className="block"><span className="label">Días de prueba gratis para negocios nuevos</span>
              <input className="input" type="number" min={0} max={90} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
            </label>
            <button className="btn-primary w-full" onClick={saveTrial}><Save className="h-4 w-4" /> Guardar</button>
            <label className="block pt-3"><span className="label">Link de cobro de Mercado Pago</span>
              <input className="input" value={mpLink} onChange={(e) => setMpLink(e.target.value)} placeholder="https://link.mercadopago.com.ar/..." />
            </label>
            <button className="btn-primary w-full" onClick={saveLink}><Save className="h-4 w-4" /> Guardar link</button>
          </section>
        )}
      </div>
    </div>
  )
}
