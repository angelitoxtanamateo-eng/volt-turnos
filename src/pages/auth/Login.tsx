import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Field, Spinner } from '../../components/ui'
import AuthShell from './AuthShell'

export default function Login() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errorMessage(error))
    // Si sale bien, GuestOnly redirige solo
  }

  const next = params.get('next')
  return (
    <AuthShell
      title="Ingresá a tu cuenta"
      subtitle="Gestioná los turnos de tu negocio"
      footer={<>¿No tenés cuenta? <Link to={`/registro${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-volt-violet2">Creá tu negocio gratis</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@email.com" />
        </Field>
        <Field label="Contraseña">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <div className="text-right">
          <Link to="/recuperar" className="text-sm text-volt-muted hover:text-volt-white">¿Olvidaste tu contraseña?</Link>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Ingresar'}</button>
      </form>
    </AuthShell>
  )
}
