import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Alert, Spinner } from '../components/ui'
import AuthShell from './auth/AuthShell'

export default function Invitation() {
  const { token } = useParams()
  const { refresh, signOut, user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !token) return
    ran.current = true
    ;(async () => {
      const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
      if (error) return setError(errorMessage(error))
      try { localStorage.setItem('volt:currentBusiness', data as string) } catch { /* sin storage */ }
      await refresh()
      navigate('/panel', { replace: true })
    })()
  }, [token, refresh, navigate])

  return (
    <AuthShell title="Uniéndote al equipo">
      {error ? (
        <div className="space-y-4">
          <Alert>{error}</Alert>
          <p className="text-sm text-volt-muted">Estás con la cuenta <b className="text-volt-white">{user?.email}</b>. Si la invitación es para otro email, cerrá sesión y entrá con ese.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => signOut()}>Cerrar sesión</button>
            <Link className="btn-primary" to="/panel">Ir al panel</Link>
          </div>
        </div>
      ) : (
        <div className="grid place-items-center py-6"><Spinner className="h-7 w-7 text-volt-violet" /></div>
      )}
    </AuthShell>
  )
}
