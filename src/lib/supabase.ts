import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost:54321', key || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Throws the PostgREST error so callers can `try/catch` one way. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}
