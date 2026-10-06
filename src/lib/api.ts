import { supabase } from './supabase'
import type { Job, Photo } from './types'

/** The live app address used in every customer link. Set VITE_APP_URL so preview deploys never leak into emails. */
export const appUrl = () => ((import.meta.env.VITE_APP_URL as string | undefined) || window.location.origin).replace(/\/+$/, '')

export const quoteLink = (token: string) => `${appUrl()}/q/${token}`
export const invoiceLink = (token: string) => `${appUrl()}/i/${token}`
export const inviteLink = (token: string) => `${appUrl()}/join/${token}`

export type EmailKind = 'quote' | 'invoice' | 'invite'

export interface SendResult {
  emailed: boolean
  link: string
  message: string
}

/**
 * Sends a quote / invoice / invite through the `send-email` Edge Function.
 * The function stamps sent_at on the record. If email isn't configured
 * (no RESEND_API_KEY) it still stamps and returns the link so the office
 * can share it by SMS instead.
 */
export async function sendEmail(kind: EmailKind, id: string, link: string): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('send-email', { body: { kind, id } })
  if (error || !data) {
    // Function not deployed / offline: stamp locally so the flow still works.
    const table = kind === 'quote' ? 'quotes' : kind === 'invoice' ? 'jobs' : 'invites'
    const col = kind === 'invoice' ? 'invoice_sent_at' : 'sent_at'
    const patch: Record<string, unknown> = { [col]: new Date().toISOString() }
    await supabase.from(table).update(patch).eq('id', id)
    await copy(link)
    return { emailed: false, link, message: 'Email not set up — link copied to clipboard' }
  }
  if (!data.emailed) await copy(link)
  return {
    emailed: Boolean(data.emailed),
    link,
    message: data.emailed ? `Emailed to ${data.to}` : data.message || 'Link copied to clipboard',
  }
}

/**
 * Always resolves the same way whether or not the account exists (no account discovery).
 * Uses our branded /reset/:token email; falls back to Supabase's built-in email if ours isn't set up.
 */
export async function requestPasswordReset(email: string) {
  const { data, error } = await supabase.functions.invoke('send-email', { body: { kind: 'password_reset', email } })
  if (error || data?.fallback) {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/reset` })
  }
}

/** Lets the business know a customer accepted/declined. Best-effort: the app also shows it in activity. */
export async function notifyQuoteResponse(token: string) {
  try {
    await supabase.functions.invoke('send-email', { body: { kind: 'quote_response', token } })
  } catch {
    /* non-blocking */
  }
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ── Photos (Supabase Storage, private bucket, {business}/{job}/{file}) ──
export const PHOTO_BUCKET = 'job-photos'

export async function uploadJobPhoto(job: Job, file: File, kind: Photo['kind']): Promise<Photo> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${job.business_id}/${job.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return { path, kind, uploaded_at: new Date().toISOString() }
}

export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60)
  const out: Record<string, string> = {}
  for (const row of data || []) if (row.signedUrl && row.path) out[row.path] = row.signedUrl
  return out
}

export async function removeJobPhoto(path: string) {
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}

export async function uploadLogo(businessId: string, file: File) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${businessId}/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw new Error(error.message)
  return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl
}
