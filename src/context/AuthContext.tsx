import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Business, Membership, Role, Settings } from '../lib/types'

const CURRENT_KEY = 'hso.business'

interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  memberships: Membership[]
  membership: Membership | null
  business: Business | null
  settings: Settings | null
  role: Role | null
  isOffice: boolean
  switchBusiness: (id: string) => void
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [loadingTenant, setLoadingTenant] = useState(false)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CURRENT_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const loadTenant = useCallback(async () => {
    if (!userId) {
      setMemberships([])
      setSettings(null)
      return
    }
    setLoadingTenant(true)
    const { data } = await supabase
      .from('memberships')
      .select('*, businesses(*)')
      .eq('user_id', userId)
      .order('created_at')
    setMemberships((data as Membership[]) || [])
    setLoadingTenant(false)
  }, [userId])

  useEffect(() => {
    loadTenant()
  }, [loadTenant])

  const membership = useMemo(
    () => memberships.find((m) => m.business_id === currentId) || memberships[0] || null,
    [memberships, currentId],
  )

  const loadSettings = useCallback(async () => {
    if (!membership) return setSettings(null)
    const { data } = await supabase.from('settings').select('*').eq('business_id', membership.business_id).maybeSingle()
    setSettings((data as Settings) || null)
  }, [membership])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const switchBusiness = useCallback((id: string) => {
    setCurrentId(id)
    try {
      localStorage.setItem(CURRENT_KEY, id)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const value: AuthState = {
    loading: !ready || (Boolean(userId) && loadingTenant && memberships.length === 0),
    session,
    user: session?.user ?? null,
    memberships,
    membership,
    business: membership?.businesses ?? null,
    settings,
    role: membership?.role ?? null,
    isOffice: membership?.role === 'owner' || membership?.role === 'admin',
    switchBusiness,
    reload: async () => {
      await loadTenant()
      await loadSettings()
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

/** For pages behind RequireBusiness: business is guaranteed. */
export function useBiz() {
  const a = useAuth()
  if (!a.membership || !a.business) throw new Error('No business selected')
  return { ...a, membership: a.membership, business: a.business, bid: a.business.id }
}
