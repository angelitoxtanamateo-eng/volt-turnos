import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useBusiness } from '../../context/BusinessContext'
import { supabase } from '../../lib/supabase'
import { PageHeader, Spinner } from '../../components/ui'
import { SUB_STATUS, ars, fmtDate, type Plan } from '../../lib/types'

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

export default function PlanPage() {
  const { plan } = useBusiness()
  const [plans, setPlans] = useState<Plan[] | null>(null)

  useEffect(() => {
    supabase.from('plans').select('*').eq('is_active', true).order('sort_order').then(({ data }) => setPlans((data ?? []) as Plan[]))
  }, [])

  return (
    <div>
      <PageHeader title="Plan y suscripción" />

      {plan && (
        <div className="card mb-6 flex flex-wrap items-center gap-4 p-5">
          <div className="flex-1">
            <div className="text-sm text-volt-muted">Plan actual</div>
            <div className="mt-1 flex items-center gap-2 text-xl font-bold">
              {plan.plan_name} <span className={`chip ${SUB_STATUS[plan.status].cls}`}>{SUB_STATUS[plan.status].label}</span>
            </div>
          </div>
          <div className="text-sm text-volt-muted">
            {plan.status === 'trialing' ? <>Prueba hasta el <b className="text-volt-white">{fmtDate(plan.trial_ends_at)}</b></>
              : plan.current_period_end ? <>Próximo vencimiento: <b className="text-volt-white">{fmtDate(plan.current_period_end)}</b></> : null}
          </div>
        </div>
      )}

      {!plans ? (
        <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.code === plan?.plan_code
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
                <button className={`${isCurrent ? 'btn-ghost' : 'btn-primary'} mt-5 w-full`} disabled title="El pago con Mercado Pago se habilita en la etapa de suscripciones">
                  {isCurrent ? 'Tu plan actual' : 'Pago con Mercado Pago (próximamente)'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
