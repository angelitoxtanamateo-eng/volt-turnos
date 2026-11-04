import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Business, Membership, Role } from '../lib/types'

interface Profile {
  id: string
  full_name: string | null
  phone: string | null
}

interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  isPlatformAdmin: boolean
  memberships: Membership[]
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  // Mientras se cargan perfil/negocios tras iniciar sesión, la app espera (evita redirecciones falsas)
  const [dataLoading, setDataLoading] = useState(false)
  const lastUserId = useRef<string | null>(null)

  const loadUserData = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setIsPlatformAdmin(false)
      setMemberships([])
      return
    }
    const uid = s.user.id
    const [p, adm, mem] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone').eq('id', uid).maybeSingle(),
      supabase.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle(),
      supabase
        .from('business_members')
        .select('id, role, business:businesses(*)')
        .eq('user_id', uid)
        .order('created_at', { ascending: true }),
    ])
    setProfile((p.data as Profile) ?? null)
    setIsPlatformAdmin(Boolean(adm.data))
    const rows = (mem.data ?? []) as unknown as { id: string; role: Role; business: Business | null }[]
    setMemberships(rows.filter((r) => r.business).map((r) => ({ id: r.id, role: r.role, business: r.business as Business })))
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      lastUserId.current = data.session?.user.id ?? null
      await loadUserData(data.session)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Evita llamar a Supabase dentro del callback (recomendación oficial): diferimos
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        const uid = s?.user.id ?? null
        // supabase-js re-emite SIGNED_IN al volver a la pestaña: solo recargamos si cambió el usuario
        if (event === 'SIGNED_IN' && uid === lastUserId.current) return
        lastUserId.current = uid
        if (event === 'SIGNED_IN') setDataLoading(true)
        setTimeout(() => { loadUserData(s).finally(() => setDataLoading(false)) }, 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadUserData])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadUserData(data.session)
  }, [loadUserData])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    try { localStorage.removeItem('volt:currentBusiness') } catch { /* sin storage */ }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ loading: loading || dataLoading, session, user: session?.user ?? null, profile, isPlatformAdmin, memberships, refresh, signOut }),
    [loading, dataLoading, session, profile, isPlatformAdmin, memberships, refresh, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
