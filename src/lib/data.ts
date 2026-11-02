import { must, supabase } from './supabase'
import type { Addon, Client, Job, Quote, Service, Staff } from './types'

export const loadStaff = async (bid: string) =>
  must(await supabase.from('staff').select('*').eq('business_id', bid).order('created_at')) as Staff[]

export const loadServices = async (bid: string) =>
  must(await supabase.from('services').select('*').eq('business_id', bid).order('sort').order('created_at')) as Service[]

export const loadAddons = async (bid: string) =>
  must(await supabase.from('addons').select('*').eq('business_id', bid).order('created_at')) as Addon[]

export const loadClients = async (bid: string) =>
  must(await supabase.from('clients').select('*').eq('business_id', bid).order('name')) as Client[]

export const loadJobs = async (bid: string) =>
  must(
    await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', bid)
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('scheduled_time', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false }),
  ) as Job[]

export const loadQuotes = async (bid: string) =>
  must(await supabase.from('quotes').select('*').eq('business_id', bid).order('created_at', { ascending: false })) as Quote[]

export const byId = <T extends { id: string }>(rows: T[] | null | undefined) =>
  Object.fromEntries((rows || []).map((r) => [r.id, r])) as Record<string, T>

/** Find-or-create a client from a job/quote's customer fields. */
export async function upsertClientFrom(bid: string, c: { name: string; phone?: string | null; email?: string | null; address?: string | null }) {
  if (!c.name.trim()) return null
  const { data: existing } = await supabase
    .from('clients')
    .select('*')
    .eq('business_id', bid)
    .ilike('name', c.name.trim())
    .limit(1)
    .maybeSingle()
  if (existing) {
    const cl = existing as Client
    if (c.address && !cl.addresses.some((a) => a.line.toLowerCase() === c.address!.toLowerCase())) {
      await supabase.from('clients').update({ addresses: [...cl.addresses, { line: c.address }] }).eq('id', cl.id)
    }
    return cl.id
  }
  const created = must(
    await supabase
      .from('clients')
      .insert({
        business_id: bid,
        name: c.name.trim(),
        phone: c.phone || null,
        email: c.email || null,
        addresses: c.address ? [{ line: c.address }] : [],
      })
      .select('id')
      .single(),
  ) as { id: string }
  return created.id
}
