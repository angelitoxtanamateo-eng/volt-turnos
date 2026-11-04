import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { Alert, Field, Spinner } from '../../components/ui'
import AuthShell from './AuthShell'

export default function Recover() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-clave`,
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else setDone(true)
  }

  return (
    <AuthShell title="Recuperar contraseña" subtitle="Te mandamos un link para crear una nueva" footer={<Link to="/ingresar" className="font-semibold text-volt-violet2">Volver</Link>}>
      {done ? (
        <Alert kind="success">Si existe una cuenta con <b>{email}</b>, vas a recibir un email con el link.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@email.com" />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Enviar link'}</button>
        </form>
      )}
    </AuthShell>
  )
}
