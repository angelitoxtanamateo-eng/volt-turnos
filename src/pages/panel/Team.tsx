import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy, Check, Trash2, UserPlus, Users, Share2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBusiness } from '../../context/BusinessContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Field, PageHeader, Spinner } from '../../components/ui'
import { ROLE_LABEL, fmtDate, type Role } from '../../lib/types'
import { copyText, waLink } from '../../lib/share'

interface Member { id: string; user_id: string; role: Role; created_at: string; name: string | null }
interface Invitation { id: string; email: string; role: Role; token: string; expires_at: string; accepted_at: string | null }

export default function Team() {
  const { user } = useAuth()
  const { current, can, plan } = useBusiness()
  const b = current!.business
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('professional')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: m } = await supabase.from('business_members').select('id, user_id, role, created_at').eq('business_id', b.id).order('created_at')
    const rows = (m ?? []) as Omit<Member, 'name'>[]
    const ids = rows.map((r) => r.user_id)
    const { data: profs } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
    const names = new Map<string, string | null>(
      ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name] as const),
    )
    setMembers(rows.map((r) => ({ ...r, name: names.get(r.user_id) ?? null })))
    if (can('manage')) {
      const { data: inv } = await supabase.from('business_invitations').select('id, email, role, token, expires_at, accepted_at')
        .eq('business_id', b.id).is('accepted_at', null).order('created_at', { ascending: false })
      setInvites((inv ?? []) as Invitation[])
    }
    setLoading(false)
  }, [b.id, can])

  useEffect(() => { load() }, [load])

  const inviteUrl = (token: string) => `${window.location.origin}/invitacion/${token}`

  async function invite(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    setBusy(true)
    const { data, error } = await supabase.from('business_invitations')
      .insert({ business_id: b.id, email: email.trim().toLowerCase(), role, invited_by: user!.id })
      .select('id, email, role, token, expires_at, accepted_at').single()
    setBusy(false)
    if (error) return setError(error.code === '23505' ? 'Ya hay una invitación pendiente para ese email' : errorMessage(error))
    setInvites((v) => [data as Invitation, ...v])
    setEmail('')
    setOk('Invitación creada. Mandale el link por WhatsApp para que se sume.')
  }

  async function removeInvite(id: string) {
    const { error } = await supabase.from('business_invitations').delete().eq('id', id)
    if (error) return setError(errorMessage(error))
    setInvites((v) => v.filter((i) => i.id !== id))
  }

  async function changeRole(m: Member, newRole: Role) {
    const { error } = await supabase.from('business_members').update({ role: newRole }).eq('id', m.id)
    if (error) return setError(errorMessage(error))
    setMembers((v) => v.map((x) => (x.id === m.id ? { ...x, role: newRole } : x)))
  }

  async function removeMember(m: Member) {
    if (!confirm(`¿Quitar a ${m.name ?? 'este miembro'} del negocio?`)) return
    const { error } = await supabase.from('business_members').delete().eq('id', m.id)
    if (error) return setError(errorMessage(error))
    setMembers((v) => v.filter((x) => x.id !== m.id))
  }

  const pros = members.filter((m) => m.role !== 'admin').length
  const max = plan?.max_professionals ?? null

  return (
    <div>
      <PageHeader
        title="Equipo"
        subtitle="Quiénes pueden entrar al panel de tu negocio"
        action={max !== null && <span className="chip bg-white/5 text-volt-muted">{pros}/{max} profesionales en plan {plan?.plan_name}</span>}
      />

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {ok && <div className="mb-4"><Alert kind="success">{ok}</Alert></div>}

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="border-b border-volt-line px-5 py-4 font-semibold">Miembros</h2>
          {loading ? (
            <div className="grid place-items-center py-10"><Spinner className="text-volt-violet" /></div>
          ) : (
            <ul className="divide-y divide-volt-line">
              {members.map((m) => {
                const editable = current!.role === 'owner' && m.role !== 'owner'
                const removable = can('manage') && m.role !== 'owner' && m.user_id !== user!.id
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-volt-violet/15 font-bold text-volt-violet2">
                      {(m.name ?? '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.name ?? 'Sin nombre'} {m.user_id === user!.id && <span className="text-xs text-volt-muted">(vos)</span>}</div>
                      <div className="text-xs text-volt-muted">Desde {fmtDate(m.created_at)}</div>
                    </div>
                    {editable ? (
                      <select className="input w-auto py-2 text-sm" value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)}>
                        <option value="admin">Administrador</option>
                        <option value="professional">Profesional</option>
                      </select>
                    ) : (
                      <span className={`chip ${m.role === 'owner' ? 'bg-volt-violet/15 text-volt-violet2' : 'bg-white/5 text-volt-muted'}`}>{ROLE_LABEL[m.role]}</span>
                    )}
                    {removable && (
                      <button onClick={() => removeMember(m)} className="rounded-lg p-2 text-volt-muted hover:bg-volt-red/10 hover:text-volt-red" title="Quitar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {can('manage') && (
          <section className="card p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4 text-volt-violet2" /> Invitar</h2>
            <form onSubmit={invite} className="mt-4 space-y-3">
              <Field label="Email de la persona">
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="empleado@email.com" />
              </Field>
              <Field label="Rol" hint={role === 'admin' ? 'Puede gestionar el negocio, el equipo y la agenda.' : 'Ve y atiende su propia agenda.'}>
                <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="professional">Profesional</option>
                  {current!.role === 'owner' && <option value="admin">Administrador</option>}
                </select>
              </Field>
              <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Crear invitación'}</button>
            </form>

            {invites.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-volt-muted">Pendientes</h3>
                <ul className="mt-2 space-y-2">
                  {invites.map((i) => (
                    <li key={i.id} className="rounded-xl border border-volt-line p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{i.email}</span>
                        <span className="chip bg-white/5 text-volt-muted">{ROLE_LABEL[i.role]}</span>
                      </div>
                      <div className="mt-1 text-xs text-volt-muted">Vence el {fmtDate(i.expires_at)}</div>
                      <div className="mt-2 flex gap-2">
                        <a className="btn-ghost flex-1 py-2 text-sm" target="_blank" rel="noreferrer"
                          href={waLink(`Hola! Te invito a sumarte a ${b.name} en VOLT Turnos. Creá tu cuenta con este email (${i.email}) desde este link: ${inviteUrl(i.token)}`)}>
                          <Share2 className="h-4 w-4" /> WhatsApp
                        </a>
                        <button className="btn-ghost py-2 px-3" title="Copiar link"
                          onClick={async () => { if (await copyText(inviteUrl(i.token))) { setCopiedId(i.id); setTimeout(() => setCopiedId(null), 1500) } }}>
                          {copiedId === i.id ? <Check className="h-4 w-4 text-volt-green" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <button className="btn-ghost py-2 px-3 hover:text-volt-red" title="Cancelar" onClick={() => removeInvite(i.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      {!loading && members.length === 1 && !can('manage') && (
        <div className="mt-4 flex items-center gap-2 text-sm text-volt-muted"><Users className="h-4 w-4" /> Sos la única persona en este negocio.</div>
      )}
    </div>
  )
}
