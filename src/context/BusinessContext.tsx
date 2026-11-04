import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import type { Membership, PlanInfo } from '../lib/types'

const KEY = 'volt:currentBusiness'

interface BusinessState {
  current: Membership | null
  plan: PlanInfo | null
  setCurrent: (businessId: string) => void
  reloadPlan: () => Promise<void>
  can: (action: 'manage' | 'owner') => boolean
}

const BusinessContext = createContext<BusinessState | null>(null)

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { memberships } = useAuth()
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY) } catch { return null }
  })
  const [plan, setPlan] = useState<PlanInfo | null>(null)

  const current = useMemo(
    () => memberships.find((m) => m.business.id === currentId) ?? memberships[0] ?? null,
    [memberships, currentId],
  )

  const setCurrent = useCallback((id: string) => {
    setCurrentId(id)
    try { localStorage.setItem(KEY, id) } catch { /* sin storage */ }
  }, [])

  const reloadPlan = useCallback(async () => {
    if (!current) { setPlan(null); return }
    const { data } = await supabase.rpc('business_plan', { p_business: current.business.id })
    setPlan((data as PlanInfo) ?? null)
  }, [current])

  useEffect(() => { reloadPlan() }, [reloadPlan])

  const can = useCallback(
    (action: 'manage' | 'owner') => {
      if (!current) return false
      if (action === 'owner') return current.role === 'owner'
      return current.role === 'owner' || current.role === 'admin'
    },
    [current],
  )

  const value = useMemo(() => ({ current, plan, setCurrent, reloadPlan, can }), [current, plan, setCurrent, reloadPlan, can])
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness() {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness fuera de BusinessProvider')
  return ctx
}
