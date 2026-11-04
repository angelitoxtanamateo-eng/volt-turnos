import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullScreenLoader } from './ui'

/** Requiere sesión iniciada */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const loc = useLocation()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to={`/ingresar?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

/** Requiere al menos un negocio; si no tiene, lo manda a crearlo */
export function RequireBusiness({ children }: { children: ReactNode }) {
  const { memberships } = useAuth()
  if (memberships.length === 0) return <Navigate to="/crear-negocio" replace />
  return <>{children}</>
}

/** Solo superadmin de VOLT. La protección real está en RLS; esto es solo navegación. */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { loading, isPlatformAdmin } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!isPlatformAdmin) return <Navigate to="/panel" replace />
  return <>{children}</>
}

/** Para páginas de login/registro: si ya hay sesión, va al panel */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const loc = useLocation()
  if (loading) return <FullScreenLoader />
  if (user) {
    const next = new URLSearchParams(loc.search).get('next')
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/panel'} replace />
  }
  return <>{children}</>
}
