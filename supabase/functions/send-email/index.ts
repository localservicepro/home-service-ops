// send-email: every email the app sends.
//
// Signed-in office users (their JWT; records read through RLS, so only their own business's documents):
//   { kind: 'quote',   id }  → emails the quote link, stamps quotes.sent_at (→ status Sent)
//   { kind: 'invoice', id }  → emails the invoice link (job must be Done or Paid), stamps jobs.invoice_sent_at
//   { kind: 'invite',  id }  → emails a team invite link, stamps invites.sent_at
// Public (no login; the anon key is enough):
//   { kind: 'password_reset', email } → single-use /reset/:token link (1 hour). Same response whether or not
//                                       the account exists, and rate limited per address.
//   { kind: 'quote_response', token } → tells the business a customer accepted/declined (once per quote).
//
// Secrets: RESEND_API_KEY (required to actually send), EMAIL_DOMAIN (verified sending domain,
// default localservicepro.com.au) or EMAIL_FROM_ADDRESS, APP_URL (default https://home-service-ops.vercel.app).
// Every link uses APP_URL — never the caller's origin — so customers never get preview or sandbox links.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  appUrl,
  fromHeader,
  inviteEmail,
  invoiceEmail,
  passwordResetEmail,
  quoteEmail,
  quoteResponseEmail,
  senderAddress,
  type Brand,
  type Email,
  type LineSummary,
} from './email.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const APP = appUrl(Deno.env.get('APP_URL'))
const FROM_ADDRESS = senderAddress(Deno.env.get('EMAIL_FROM_ADDRESS'), Deno.env.get('EMAIL_DOMAIN'))
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const invoiceNum = (jobNum: string) => `INV-${String(jobNum).replace(/^[A-Z]+-/, '')}`
const dateAU = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' })

async function deliver(msg: Email): Promise<{ emailed: boolean; message?: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { emailed: false, message: 'Email not set up yet — link copied to clipboard' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: msg.from, to: [msg.to], reply_to: msg.replyTo || undefined, subject: msg.subject, html: msg.html, text: msg.text }),
  })
  if (!res.ok) {
    console.error('resend failed', res.status, await res.text())
    return { emailed: false, message: `Email couldn't be sent (${res.status}) — link copied instead` }
  }
  return { emailed: true }
}

async function brandFor(bid: string): Promise<Brand & { terms: number }> {
  const { data } = await admin
    .from('settings')
    .select('business_name, email, phone, logo_url, payment_terms_days')
    .eq('business_id', bid)
    .maybeSingle()
  return {
    name: data?.business_name || 'Your service provider',
    email: data?.email || null,
    phone: data?.phone || null,
    logoUrl: data?.logo_url || null,
    terms: data?.payment_terms_days ?? 7,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let p: { kind?: string; id?: string; email?: string; token?: string }
  try {
    p = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  // ── Public: password reset ─────────────────────────────────
  if (p.kind === 'password_reset') {
    const email = String(p.email || '').trim().toLowerCase()
    const same = { ok: true, message: "If that email has an account, we've sent a reset link." }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(same)
    if (!Deno.env.get('RESEND_API_KEY')) return json({ ...same, fallback: true })
    const { data: allowed } = await admin.rpc('email_rate_ok', { p_kind: 'password_reset', p_key: email, p_max: 3, p_window_seconds: 3600 })
    if (!allowed) return json(same)
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
    if (!error && data?.properties?.hashed_token) {
      const link = `${APP}/reset/${data.properties.hashed_token}`
      const m = passwordResetEmail({ link })
      await deliver({ from: fromHeader('Home Service Ops', FROM_ADDRESS), to: email, ...m })
    }
    return json(same)
  }

  // ── Public: customer responded to a quote → tell the business ─
  if (p.kind === 'quote_response') {
    const tok = String(p.token || '')
    if (tok.length < 32) return json({ ok: true })
    const { data: q } = await admin.from('quotes').select('*').eq('public_token', tok).maybeSingle()
    if (!q || !['Accepted', 'Declined'].includes(q.status) || q.response_notified_at) return json({ ok: true })
    // Claim the notification first so double-taps can't send twice.
    const { data: claimed } = await admin
      .from('quotes')
      .update({ response_notified_at: new Date().toISOString() })
      .eq('id', q.id)
      .is('response_notified_at', null)
      .select('id')
    if (!claimed?.length) return json({ ok: true })
    const brand = await brandFor(q.business_id)
    const { data: owner } = await admin.from('settings').select('owner_email, email').eq('business_id', q.business_id).maybeSingle()
    const to = owner?.owner_email || owner?.email
    if (!to) return json({ ok: true })
    let preferred: string | null = null
    if (q.request_job_id) {
      const { data: j } = await admin.from('jobs').select('scheduled_date').eq('id', q.request_job_id).maybeSingle()
      if (j?.scheduled_date) preferred = dateAU(new Date(`${j.scheduled_date}T12:00:00`))
    }
    const m = quoteResponseEmail({
      brand,
      customer: q.customer,
      num: q.num,
      total: q.price,
      accepted: q.status === 'Accepted',
      reason: q.decline_reason,
      preferredDate: preferred,
      link: `${APP}/quotes/${q.id}`,
    })
    await deliver({ from: fromHeader(brand.name, FROM_ADDRESS), to, ...m })
    return json({ ok: true })
  }

  // ── Signed-in office sends ─────────────────────────────────
  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return json({ error: 'Not signed in' }, 401)
  if (!p.id || !['quote', 'invoice', 'invite'].includes(p.kind || '')) return json({ error: 'kind and id are required' }, 400)

  const now = new Date().toISOString()
  let to: string | null = null
  let link = ''
  let msg: { subject: string; html: string; text: string }
  let brand: Brand & { terms: number }

  if (p.kind === 'quote') {
    const { data: q, error } = await supabase.from('quotes').select('*').eq('id', p.id).single()
    if (error || !q) return json({ error: 'Quote not found' }, 404)
    if (q.status === 'Accepted' || q.status === 'Declined') return json({ error: `This quote was already ${q.status.toLowerCase()}` }, 409)
    brand = await brandFor(q.business_id)
    link = `${APP}/q/${q.public_token}`
    to = q.email
    msg = quoteEmail({
      brand,
      customer: q.customer,
      num: q.num,
      address: q.address,
      note: q.note,
      lines: (q.line_items || []) as LineSummary[],
      total: q.price,
      gst: q.gst,
      validUntil: q.valid_until,
      link,
    })
    const { error: upErr } = await supabase.from('quotes').update({ sent_at: now }).eq('id', p.id)
    if (upErr) return json({ error: upErr.message }, 403)
  } else if (p.kind === 'invoice') {
    const { data: j, error } = await supabase.from('jobs').select('*').eq('id', p.id).single()
    if (error || !j) return json({ error: 'Job not found' }, 404)
    if (j.status !== 'Done' && j.status !== 'Paid') return json({ error: 'Finish the job before sending the invoice' }, 409)
    brand = await brandFor(j.business_id)
    link = `${APP}/i/${j.public_token}`
    to = j.email
    const issued = j.invoice_sent_at ? new Date(j.invoice_sent_at) : new Date()
    const due = new Date(issued.getTime() + brand.terms * 86_400_000)
    msg = invoiceEmail({
      brand,
      customer: j.customer,
      invoiceNum: invoiceNum(j.num),
      service: j.service,
      address: j.address,
      lines: (j.line_items || []) as LineSummary[],
      total: j.price,
      balance: Math.max(0, Number(j.price) - Number(j.amount_paid || 0)),
      gst: j.gst,
      paid: j.pay_state === 'paid',
      dueDate: dateAU(due),
      link,
    })
    const { error: upErr } = await supabase.from('jobs').update({ invoice_sent_at: now }).eq('id', p.id)
    if (upErr) return json({ error: upErr.message }, 403)
  } else {
    const { data: inv, error } = await supabase.from('invites').select('*').eq('id', p.id).single()
    if (error || !inv) return json({ error: 'Invite not found' }, 404)
    brand = await brandFor(inv.business_id)
    link = `${APP}/join/${inv.token}`
    to = inv.email
    msg = inviteEmail({ brand, role: inv.role, link })
    const { error: upErr } = await supabase.from('invites').update({ sent_at: now }).eq('id', p.id)
    if (upErr) return json({ error: upErr.message }, 403)
  }

  if (!to) return json({ emailed: false, link, message: 'No email address on file — link copied to clipboard' })
  const r = await deliver({ from: fromHeader(brand.name, FROM_ADDRESS), replyTo: brand.email || undefined, to, ...msg })
  return json({ ...r, to, link })
})
