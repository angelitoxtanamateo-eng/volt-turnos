import { useCallback, useEffect, useState } from 'react'
import { Check, X, ExternalLink, Clock, CheckCircle2, XCircle, Copy } from 'lucide-react'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Field, PageHeader, Spinner } from '../../components/ui'
import Modal from '../../components/Modal'
import { SUB_STATUS, ars, fmtDate, type Plan } from '../../lib/types'
import { copyText } from '../../lib/share'

export const FEATURE_LABELS: [string, string][] = [
  ['booking_link', 'Link de reservas y página propia'],
  ['calendar', 'Calendario y servicios'],
  ['crm', 'Clientes (CRM)'],
  ['cash', 'Caja'],
  ['stats', 'Estadísticas'],
  ['waitlist', 'Lista de espera'],
  ['advanced_branding', 'Personalización avanzada'],
  ['commissions', 'Comisiones'],
  ['advanced_reports', 'Reportes avanzados'],
  ['branches', 'Sucursales'],
]

interface SubPayment { id: string; plan_id: string; months: number; amount: number; reference: string; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string; period_end: string | null; plans: { name: string } | null }

export default function PlanPage() {
  const { current, plan, reloadPlan } = useBusiness()
  const b = current!.business
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [history, setHistory] = useState<SubPayment[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [paying, setPaying] = useState<Plan | null>(null)

  const load = useCallback(async () => {
    const [p, h, l] = await Promise.all([
      supabase.from('plans').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('subscription_payments').select('id, plan_id, months, amount, reference, status, admin_note, created_at, period_end, plans(name)')
        .eq('business_id', b.id).order('created_at', { ascending: false }).limit(24),
      supabase.rpc('get_payment_link'),
    ])
    setPlans((p.data ?? []) as Plan[])
    setHistory((h.data ?? []) as unknown as SubPayment[])
    setLink((l.data as string) ?? null)
  }, [b.id])
  useEffect(() => { load() }, [load])

  const pending = history.find((h) => h.status === 'pending')
  const lastRejected = history[0]?.status === 'rejected' ? history[0] : null
  const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null)
  const left = plan?.status === 'trialing' ? daysLeft(plan.trial_ends_at) : daysLeft(plan?.current_period_end ?? null)

  return (
    <div>
      <PageHeader title="Plan y suscripción" />

      {plan && (
        <div className="card mb-4 flex flex-wrap items-center gap-4 p-5">
          <div className="flex-1">
            <div className="text-sm text-volt-muted">Plan actual</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
              {plan.plan_name} <span className={`chip ${SUB_STATUS[plan.status].cls}`}>{SUB_STATUS[plan.status].label}</span>
              {!plan.is_usable && <span className="chip bg-volt-red/15 text-volt-red">Vencido</span>}
            </div>
          </div>
          <div className="text-sm text-volt-muted">
            {plan.status === 'trialing' ? <>Prueba hasta el <b className="text-volt-white">{fmtDate(plan.trial_ends_at)}</b></>
              : plan.current_period_end ? <>Pagado hasta el <b className="text-volt-white">{fmtDate(plan.current_period_end)}</b></> : null}
            {left !== null && left > 0 && <span className="ml-1">({left} {left === 1 ? 'día' : 'días'})</span>}
          </div>
        </div>
      )}

      {pending && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-volt-amber/30 bg-volt-amber/10 p-4 text-sm">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-volt-amber" />
          <div>
            <div className="font-semibold text-amber-300">Pago en revisión</div>
            <div className="text-volt-muted">Recibimos tu aviso de pago del plan {pending.plans?.name} ({ars(Number(pending.amount))}, operación {pending.reference}). Lo verificamos y se activa en el día. No hace falta que hagas nada más.</div>
          </div>
        </div>
      )}
      {lastRejected && !pending && (
        <div className="mb-4"><Alert>No pudimos verificar tu último pago (operación {lastRejected.reference}){lastRejected.admin_note ? `: ${lastRejected.admin_note}` : ''}. Revisá el número o escribinos.</Alert></div>
      )}

      {!plans ? (
        <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.code === plan?.plan_code && plan?.status === 'active'
            const featured = p.code === 'pro'
            return (
              <div key={p.id} className={`card relative flex flex-col p-5 ${featured ? 'border-volt-violet shadow-xl shadow-volt-violet/10' : ''}`}>
                {featured && <span className="chip absolute -top-3 left-5 bg-volt-violet text-white">Más elegido</span>}
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-xs text-volt-muted">{p.description}</div>
                <div className="mt-4 text-3xl font-extrabold">{ars(Number(p.price_ars))}<span className="text-sm font-medium text-volt-muted">/mes</span></div>
                <div className="mt-1 text-sm text-volt-muted">{p.max_professionals === null ? 'Profesionales ilimitados' : p.max_professionals === 1 ? '1 profesional' : `Hasta ${p.max_professionals} profesionales`}</div>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {FEATURE_LABELS.map(([k, label]) => (
                    <li key={k} className={`flex items-center gap-2 ${p.features[k] ? '' : 'text-volt-muted/50'}`}>
                      {p.features[k] ? <Check className="h-4 w-4 text-volt-green" /> : <X className="h-4 w-4" />} {label}
                    </li>
                  ))}
                </ul>
                <button className={`${isCurrent ? 'btn-ghost' : 'btn-primary'} mt-5 w-full`} disabled={!!pending || !link} onClick={() => setPaying(p)}>
                  {isCurrent ? 'Renovar' : `Pagar ${p.name}`}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {history.length > 0 && (
        <section className="card mt-6">
          <h2 className="border-b border-volt-line px-5 py-4 font-semibold">Historial de pagos</h2>
          <ul className="divide-y divide-volt-line">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                {h.status === 'approved' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-volt-green" /> : h.status === 'rejected' ? <XCircle className="h-5 w-5 shrink-0 text-volt-red" /> : <Clock className="h-5 w-5 shrink-0 text-volt-amber" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Plan {h.plans?.name} · {h.months} {h.months === 1 ? 'mes' : 'meses'}</div>
                  <div className="truncate text-xs text-volt-muted">{fmtDate(h.created_at)} · operación {h.reference}{h.period_end ? ` · hasta ${fmtDate(h.period_end)}` : ''}</div>
                </div>
                <span className="font-semibold">{ars(Number(h.amount))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PayModal plan={paying} link={link} businessId={b.id} businessName={b.name} onClose={() => setPaying(null)} onSent={() => { load(); reloadPlan() }} />
    </div>
  )
}

function PayModal({ plan, link, businessId, businessName, onClose, onSent }: { plan: Plan | null; link: string | null; businessId: string; businessName: string; onClose: () => void; onSent: () => void }) {
  const [months, setMonths] = useState(1)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [opened, setOpened] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (plan) { setMonths(1); setReference(''); setNote(''); setOpened(false); setError('') } }, [plan])
  if (!plan || !link) return null
  const total = Number(plan.price_ars) * months

  async function send() {
    setError('')
    if (reference.trim().length < 3) return setError('Pegá el número de operación que te dio Mercado Pago')
    setBusy(true)
    const { error } = await supabase.from('subscription_payments').insert({
      business_id: businessId, plan_id: plan!.id, months, reference: reference.trim(), payer_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(error.code === '23505' ? 'Ese número de operación ya fue informado' : errorMessage(error))
    onSent(); onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Pagar plan ${plan.name}`}
      footer={<button className="btn-primary w-full" onClick={send} disabled={busy || !opened}>{busy ? <Spinner /> : 'Ya pagué, avisar'}</button>}>
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}

        <div>
          <span className="label">¿Cuántos meses?</span>
          <div className="grid grid-cols-4 gap-2">
            {[1, 3, 6, 12].map((m) => (
              <button key={m} onClick={() => setMonths(m)} className={`rounded-xl border py-2.5 text-sm font-semibold ${months === m ? 'border-volt-violet bg-volt-violet/15' : 'border-volt-line text-volt-muted'}`}>{m} {m === 1 ? 'mes' : 'meses'}</button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-volt-line bg-volt-bg p-4 text-center">
          <div className="text-sm text-volt-muted">Monto a pagar</div>
          <div className="mt-1 text-3xl font-extrabold">{ars(total)}</div>
          <button className="mt-1 inline-flex items-center gap-1 text-xs text-volt-violet2" onClick={async () => { if (await copyText(String(total))) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copiado' : 'Copiar monto'}
          </button>
        </div>

        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-volt-violet text-xs font-bold text-white">1</span>
            <div className="flex-1">
              <div className="font-semibold">Pagá con Mercado Pago</div>
              <div className="text-volt-muted">Se abre el link de cobro de VOLT. Poné <b className="text-volt-white">{ars(total)}</b> y en el detalle escribí <b className="text-volt-white">{businessName}</b>.</div>
              <a href={link} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}
                className="btn-primary mt-3 w-full bg-[#009EE3] shadow-none hover:bg-[#0089c7]">
                <ExternalLink className="h-4 w-4" /> Abrir Mercado Pago
              </a>
            </div>
          </li>
          <li className="flex gap-3">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${opened ? 'bg-volt-violet text-white' : 'bg-volt-line text-volt-muted'}`}>2</span>
            <div className="flex-1 space-y-3">
              <div>
                <div className="font-semibold">Avisanos que pagaste</div>
                <div className="text-volt-muted">En el comprobante de Mercado Pago figura el "Número de operación".</div>
              </div>
              <Field label="Número de operación"><input className="input" inputMode="numeric" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: 91234567890" /></Field>
              <Field label="Comentario (opcional)"><input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pagó mi socio desde su cuenta" /></Field>
            </div>
          </li>
        </ol>
        <p className="text-xs text-volt-muted">Verificamos el pago y activamos tu plan por {months} {months === 1 ? 'mes' : 'meses'}. Si todavía te quedan días pagos del mismo plan, se suman.</p>
      </div>
    </Modal>
  )
}
