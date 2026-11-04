import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Alert, Field, FullScreenLoader, Spinner } from '../../components/ui'
import AuthShell from './AuthShell'

export default function NewPassword() {
  const { loading, user } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <FullScreenLoader />
  if (!user) {
    return (
      <AuthShell title="Link inválido o vencido">
        <Alert>Pedí un nuevo link de recuperación.</Alert>
        <button className="btn-ghost mt-4 w-full" onClick={() => navigate('/recuperar')}>Pedir otro link</button>
      </AuthShell>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    navigate('/panel', { replace: true })
  }

  return (
    <AuthShell title="Nueva contraseña">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Guardar'}</button>
      </form>
    </AuthShell>
  )
}
