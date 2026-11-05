import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Field, Spinner } from '../../components/ui'
import AuthShell from './AuthShell'

export default function Register() {
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) return setError('Ingresá tu nombre')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    setBusy(true)
    const next = params.get('next')
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim(), phone: phone.trim() },
        emailRedirectTo: `${window.location.origin}${next && next.startsWith('/') ? next : '/crear-negocio'}`,
      },
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    // Si la confirmación por email está activa, no hay sesión todavía
    if (!data.session) setSent(true)
  }

  if (sent) {
    return (
      <AuthShell title="Revisá tu email" footer={<Link to="/ingresar" className="font-semibold text-volt-violet2">Volver a ingresar</Link>}>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-volt-green/15 text-volt-green"><MailCheck className="h-7 w-7" /></div>
          <p className="text-sm text-volt-muted">
            Te mandamos un link a <b className="text-volt-white">{email}</b> para confirmar tu cuenta. Tocalo y seguís con la creación de tu negocio.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Creá tu cuenta"
      subtitle="15 días gratis. Sin tarjeta."
      footer={<>¿Ya tenés cuenta? <Link to={`/ingresar${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-semibold text-volt-violet2">Ingresá</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Tu nombre">
          <input className="input" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Yor Fernández" />
        </Field>
        <Field label="WhatsApp (opcional)">
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="358 123 4567" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@email.com" />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres">
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Crear cuenta'}</button>
      </form>
    </AuthShell>
  )
}
