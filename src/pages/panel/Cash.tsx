import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Plus, Download, Trash2, Percent } from 'lucide-react'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Empty, Field, PageHeader, Spinner, StatCard } from '../../components/ui'
import Modal from '../../components/Modal'
import { EXPENSE_CATEGORIES, PAY_METHODS, ars, type PayMethod, type Professional } from '../../lib/types'
import { addDays, addMonths, daysInMonth, dayRangeIso, hmInTz, startOfMonth, startOfWeek, todayInTz, ymdInTz } from '../../lib/time'

type Period = 'hoy' | 'semana' | 'mes' | 'mes_anterior' | 'custom'
interface Payment { id: string; amount: number; method: PayMethod; commission_pct: number; description: string | null; paid_at: string; professional_id: string | null; clients: { name: string } | null }
interface Expense { id: string; amount: number; category: string; description: string | null; spent_at: string }

export default function Cash() {
  const { current, plan } = useBusiness()
  const b = current!.business
  const tz = b.timezone
  const today = todayInTz(tz)
  const [period, setPeriod] = useState<Period>('mes')
  const [custom, setCustom] = useState<[string, string]>([startOfMonth(today), today])
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [pros, setPros] = useState<Professional[]>([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'pago' | 'gasto' | null>(null)

  const range = useMemo((): [string, string] => {
    switch (period) {
      case 'hoy': return [today, addDays(today, 1)]
      case 'semana': { const s = startOfWeek(today); return [s, addDays(s, 7)] }
      case 'mes': { const s = startOfMonth(today); return [s, addDays(s, daysInMonth(today))] }
      case 'mes_anterior': { const s = addMonths(today, -1); return [s, addDays(s, daysInMonth(s))] }
      default: return [custom[0], addDays(custom[1], 1)]
    }
  }, [period, today, custom])

  const load = useCallback(async () => {
    const [from, to] = dayRangeIso(range[0], range[1], tz)
    const [p, e, pr] = await Promise.all([
      supabase.from('payments').select('id, amount, method, commission_pct, description, paid_at, professional_id, clients(name)')
        .eq('business_id', b.id).gte('paid_at', from).lt('paid_at', to).order('paid_at', { ascending: false }),
      supabase.from('expenses').select('id, amount, category, description, spent_at').eq('business_id', b.id)
        .gte('spent_at', range[0]).lt('spent_at', range[1]).order('spent_at', { ascending: false }),
      supabase.from('professionals').select('*').eq('business_id', b.id).order('sort_order'),
    ])
    if (p.error) setError(errorMessage(p.error))
    setPayments(((p.data ?? []) as unknown as Payment[]).map((x) => ({ ...x, amount: Number(x.amount), commission_pct: Number(x.commission_pct) })))
    setExpenses(((e.data ?? []) as Expense[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setPros((pr.data ?? []) as Professional[])
  }, [b.id, range, tz])
  useEffect(() => { if (plan?.features?.cash) load() }, [load, plan])

  const showCommissions = Boolean(plan?.features?.commissions)
  const income = (payments ?? []).reduce((a, p) => a + p.amount, 0)
  const spent = expenses.reduce((a, e) => a + e.amount, 0)
  const commissions = showCommissions ? (payments ?? []).reduce((a, p) => a + (p.amount * p.commission_pct) / 100, 0) : 0
  const profit = income - spent - commissions
  const byMethod = Object.entries(PAY_METHODS).map(([k, label]) => ({ k, label, total: (payments ?? []).filter((p) => p.method === k).reduce((a, p) => a + p.amount, 0) })).filter((x) => x.total > 0)
  const byPro = pros.map((pr) => {
    const list = (payments ?? []).filter((p) => p.professional_id === pr.id)
    const total = list.reduce((a, p) => a + p.amount, 0)
    return { id: pr.id, name: pr.name, total, count: list.length, commission: list.reduce((a, p) => a + (p.amount * p.commission_pct) / 100, 0) }
  }).filter((x) => x.count > 0)

  async function delPayment(id: string) {
    if (!confirm('¿Borrar este cobro?')) return
    const { error } = await supabase.from('payments').delete().eq('id', id)
    if (error) return setError(errorMessage(error))
    load()
  }
  async function delExpense(id: string) {
    if (!confirm('¿Borrar este gasto?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return setError(errorMessage(error))
    load()
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const proName = (id: string | null) => pros.find((p) => p.id === id)?.name ?? ''
    const rows = [
      ['Tipo', 'Fecha', 'Hora', 'Detalle', 'Cliente', 'Profesional', 'Medio / Categoría', 'Monto', 'Comisión'],
      ...(payments ?? []).map((p) => ['Ingreso', ymdInTz(p.paid_at, tz), hmInTz(p.paid_at, tz), p.description, p.clients?.name, proName(p.professional_id), PAY_METHODS[p.method], p.amount, showCommissions ? ((p.amount * p.commission_pct) / 100).toFixed(2) : '']),
      ...expenses.map((e) => ['Gasto', e.spent_at, '', e.description, '', '', EXPENSE_CATEGORIES[e.category] ?? e.category, -e.amount, '']),
      [], ['', '', '', 'Ingresos', '', '', '', income], ['', '', '', 'Gastos', '', '', '', -spent],
      ...(showCommissions ? [['', '', '', 'Comisiones', '', '', '', -commissions.toFixed(2)]] : []),
      ['', '', '', 'Ganancia estimada', '', '', '', profit.toFixed(2)],
    ]
    const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `caja-${b.slug}-${range[0]}-a-${addDays(range[1], -1)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (plan && !plan.features?.cash) {
    return (
      <div>
        <PageHeader title="Caja" />
        <Empty icon={<Wallet className="h-6 w-6" />} title="La caja está en el plan Pro"
          text="Ingresos por día y mes, medios de pago, gastos, ganancias y reportes." action={<Link to="/panel/plan" className="btn-primary">Ver planes</Link>} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Caja" subtitle="Ingresos reales: se registran al cobrar, no al reservar"
        action={
          <div className="flex gap-2">
            <button className="btn-ghost py-2.5 text-sm" onClick={exportCsv} disabled={!payments}><Download className="h-4 w-4" /> Reporte</button>
            <button className="btn-ghost py-2.5 text-sm" onClick={() => setModal('gasto')}><TrendingDown className="h-4 w-4" /> Gasto</button>
            <button className="btn-primary py-2.5 text-sm" onClick={() => setModal('pago')}><Plus className="h-4 w-4" /> Cobro</button>
          </div>
        } />

      <div className="mb-4 flex flex-wrap gap-2">
        {([['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Este mes'], ['mes_anterior', 'Mes anterior'], ['custom', 'Elegir fechas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${period === k ? 'border-volt-violet bg-volt-violet/15' : 'border-volt-line text-volt-muted'}`}>{l}</button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input w-auto py-1.5 text-sm" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1] < e.target.value ? e.target.value : custom[1]])} />
            <span className="text-volt-muted">a</span>
            <input type="date" className="input w-auto py-1.5 text-sm" value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} />
          </div>
        )}
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {!payments ? (
        <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Ingresos" value={ars(income)} icon={<TrendingUp className="h-4 w-4" />} note={`${payments.length} cobros`} />
            <StatCard label="Gastos" value={ars(spent)} icon={<TrendingDown className="h-4 w-4" />} note={`${expenses.length} gastos`} />
            {showCommissions
              ? <StatCard label="Comisiones" value={ars(commissions)} icon={<Percent className="h-4 w-4" />} note="A pagar al equipo" />
              : <StatCard label="Ticket promedio" value={ars(payments.length ? income / payments.length : 0)} icon={<Wallet className="h-4 w-4" />} />}
            <StatCard label="Ganancia estimada" value={<span className={profit < 0 ? 'text-volt-red' : 'text-volt-green'}>{ars(profit)}</span>} icon={<PiggyBank className="h-4 w-4" />} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="card p-5">
              <h2 className="font-semibold">Por medio de pago</h2>
              {byMethod.length === 0 ? <p className="mt-3 text-sm text-volt-muted">Sin cobros en el período.</p> : (
                <ul className="mt-3 space-y-3">
                  {byMethod.map((m) => (
                    <li key={m.k}>
                      <div className="flex justify-between text-sm"><span>{m.label}</span><b>{ars(m.total)}</b></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-volt-line"><div className="h-full rounded-full bg-volt-violet" style={{ width: `${(m.total / income) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-5 lg:col-span-2">
              <h2 className="font-semibold">Por profesional</h2>
              {byPro.length === 0 ? <p className="mt-3 text-sm text-volt-muted">Sin cobros asociados a profesionales.</p> : (
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="text-left text-xs text-volt-muted"><th className="pb-2 font-medium">Profesional</th><th className="pb-2 font-medium">Servicios</th><th className="pb-2 text-right font-medium">Facturó</th>{showCommissions && <th className="pb-2 text-right font-medium">Comisión</th>}</tr></thead>
                  <tbody className="divide-y divide-volt-line">
                    {byPro.map((x) => (
                      <tr key={x.id}><td className="py-2">{x.name}</td><td className="py-2 text-volt-muted">{x.count}</td><td className="py-2 text-right font-semibold">{ars(x.total)}</td>{showCommissions && <td className="py-2 text-right text-volt-violet2">{ars(x.commission)}</td>}</tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!showCommissions && <p className="mt-3 text-xs text-volt-muted">El cálculo de comisiones está en el plan Business.</p>}
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="border-b border-volt-line px-5 py-4 font-semibold">Cobros</h2>
              {payments.length === 0 ? <p className="px-5 py-6 text-sm text-volt-muted">Todavía no hay cobros. Se cargan al completar un turno en la agenda.</p> : (
                <ul className="max-h-[480px] divide-y divide-volt-line overflow-y-auto">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.clients?.name ?? p.description ?? 'Cobro'}</div>
                        <div className="truncate text-xs text-volt-muted">{ymdInTz(p.paid_at, tz).split('-').reverse().slice(0, 2).join('/')} {hmInTz(p.paid_at, tz)} · {PAY_METHODS[p.method]}{p.clients && p.description ? ` · ${p.description}` : ''}</div>
                      </div>
                      <span className="font-semibold text-volt-green">+{ars(p.amount)}</span>
                      <button className="rounded-lg p-1.5 text-volt-muted hover:text-volt-red" onClick={() => delPayment(p.id)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <h2 className="border-b border-volt-line px-5 py-4 font-semibold">Gastos</h2>
              {expenses.length === 0 ? <p className="px-5 py-6 text-sm text-volt-muted">Sin gastos en el período.</p> : (
                <ul className="max-h-[480px] divide-y divide-volt-line overflow-y-auto">
                  {expenses.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{e.description || EXPENSE_CATEGORIES[e.category]}</div>
                        <div className="text-xs text-volt-muted">{e.spent_at.split('-').reverse().slice(0, 2).join('/')} · {EXPENSE_CATEGORIES[e.category]}</div>
                      </div>
                      <span className="font-semibold text-volt-red">−{ars(e.amount)}</span>
                      <button className="rounded-lg p-1.5 text-volt-muted hover:text-volt-red" onClick={() => delExpense(e.id)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <MoneyModal kind={modal} onClose={() => setModal(null)} onSaved={load} businessId={b.id} pros={pros} today={today} />
    </div>
  )
}

function MoneyModal({ kind, onClose, onSaved, businessId, pros, today }: { kind: 'pago' | 'gasto' | null; onClose: () => void; onSaved: () => void; businessId: string; pros: Professional[]; today: string }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [category, setCategory] = useState('productos')
  const [description, setDescription] = useState('')
  const [pro, setPro] = useState('')
  const [date, setDate] = useState(today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (kind) { setAmount(''); setDescription(''); setPro(''); setDate(today); setError('') } }, [kind, today])

  async function save() {
    setError('')
    const n = Number(amount.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return setError('Ingresá un monto mayor a 0')
    setBusy(true)
    const res = kind === 'pago'
      ? await supabase.from('payments').insert({ business_id: businessId, amount: n, method, description: description.trim() || null, professional_id: pro || null })
      : await supabase.from('expenses').insert({ business_id: businessId, amount: n, category, description: description.trim() || null, spent_at: date })
    setBusy(false)
    if (res.error) return setError(errorMessage(res.error))
    onSaved(); onClose()
  }

  return (
    <Modal open={!!kind} onClose={onClose} title={kind === 'pago' ? 'Registrar cobro' : 'Registrar gasto'}
      footer={<button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Guardar'}</button>}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Monto (ARS)"><input className="input text-lg font-semibold" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        {kind === 'pago' ? (
          <>
            <Field label="Medio de pago">
              <div className="flex flex-wrap gap-2">
                {Object.entries(PAY_METHODS).map(([k, v]) => (
                  <button type="button" key={k} onClick={() => setMethod(k as PayMethod)} className={`rounded-xl border px-3 py-2 text-sm ${method === k ? 'border-volt-violet bg-volt-violet/15' : 'border-volt-line text-volt-muted'}`}>{v}</button>
                ))}
              </div>
            </Field>
            <Field label="Profesional (opcional)">
              <select className="input" value={pro} onChange={(e) => setPro(e.target.value)}>
                <option value="">— Ninguno —</option>
                {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Categoría">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Fecha"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </>
        )}
        <Field label="Detalle (opcional)"><input className="input" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'pago' ? 'Venta de shampoo' : 'Tinturas'} /></Field>
      </div>
    </Modal>
  )
}
