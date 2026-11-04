import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Professional, Service } from './types'

/** Servicios, profesionales y quién hace qué, del negocio actual */
export function useCatalog(businessId: string) {
  const [services, setServices] = useState<Service[]>([])
  const [pros, setPros] = useState<Professional[]>([])
  const [proServices, setProServices] = useState<Record<string, string[]>>({})
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const [s, p, ps] = await Promise.all([
      supabase.from('services').select('*').eq('business_id', businessId).order('sort_order').order('name'),
      supabase.from('professionals').select('*').eq('business_id', businessId).order('sort_order').order('name'),
      supabase.from('professional_services').select('professional_id, service_id').eq('business_id', businessId),
    ])
    setServices((s.data ?? []) as Service[])
    setPros((p.data ?? []) as Professional[])
    const map: Record<string, string[]> = {}
    for (const r of (ps.data ?? []) as { professional_id: string; service_id: string }[]) (map[r.professional_id] ??= []).push(r.service_id)
    setProServices(map)
    setLoaded(true)
  }, [businessId])

  useEffect(() => { reload() }, [reload])
  return { services, pros, proServices, loaded, reload }
}
