// send-email: emails a quote, invoice or team invite and stamps its sent_at.
//
// Body: { kind: 'quote' | 'invoice' | 'invite', id: string, origin?: string }
// Auth: the caller's JWT. Records are read through RLS with the caller's token,
// so an office user can only send their own business's documents.
//
// Env: RESEND_API_KEY (optional — without it we stamp and return the link),
//      EMAIL_FROM (e.g. "Home Service Ops <jobs@yourdomain.com.au>"),
//      APP_URL (base for customer links; falls back to the caller's origin).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(n) || 0)
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function layout(business: string, heading: string, body: string, cta: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F4F8FC;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#08172B">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:linear-gradient(150deg,#08172B,#0E2942);border-radius:18px;padding:22px 22px 26px;color:#fff">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.16em;color:#35C6F4;text-transform:uppercase">${esc(business)}</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:6px">${esc(heading)}</div>
    </div>
    <div style="background:#fff;border:1px solid #DCE7F1;border-radius:16px;padding:20px 22px;margin-top:-10px">
      ${body}
      <a href="${esc(cta.url)}" style="display:inline-block;margin-top:18px;background:linear-gradient(135deg,#0C6FD0,#35C6F4);background-color:#0C6FD0;color:#fff;font-weight:700;text-decoration:none;padding:13px 22px;border-radius:12px">${esc(cta.label)}</a>
      <p style="font-size:12px;color:#8FA3BC;margin:18px 0 0">Or open: <a href="${esc(cta.url)}" style="color:#0C6FD0">${esc(cta.url)}</a></p>
    </div>
    <p style="text-align:center;font-size:11px;color:#8FA3BC;margin-top:16px">Sent with Home Service Ops by Local Service Pro</p>
  </div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return json({ error: 'Not signed in' }, 401)

  let payload: { kind?: string; id?: string; origin?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const { kind, id } = payload
  const origin = (Deno.env.get('APP_URL') || payload.origin || '').replace(/\/$/, '')
  if (!kind || !id || !origin) return json({ error: 'kind, id and origin are required' }, 400)

  let to: string | null = null
  let subject = ''
  let html = ''
  let link = ''
  let businessId = ''
  let replyTo: string | undefined
  const now = new Date().toISOString()

  const bizName = async (bid: string) => {
    const { data } = await supabase.from('settings').select('business_name, email').eq('business_id', bid).maybeSingle()
    return { name: data?.business_name || 'Your service provider', replyTo: data?.email || undefined }
  }

  if (kind === 'quote') {
    const { data: q, error } = await supabase.from('quotes').select('*').eq('id', id).single()
    if (error || !q) return json({ error: 'Quote not found' }, 404)
    businessId = q.business_id
    link = `${origin}/q/${q.public_token}`
    to = q.email
    const b = await bizName(q.business_id)
    subject = `Your quote from ${b.name} — ${aud(q.price)}`
    html = layout(
      b.name,
      `Quote ${q.num} · ${aud(q.price)}`,
      `<p style="margin:0 0 10px">Hi ${esc(q.customer.split(' ')[0])},</p>
       <p style="margin:0;color:#16374F;line-height:1.5">Thanks for asking us to quote${q.address ? ` for <b>${esc(q.address)}</b>` : ''}. You can view the full breakdown and accept or decline online.</p>
       ${q.note ? `<p style="margin:12px 0 0;color:#5A7189;line-height:1.5">${esc(q.note)}</p>` : ''}`,
      { label: 'View & accept quote', url: link },
    )
    const { error: upErr } = await supabase.from('quotes').update({ sent_at: now }).eq('id', id)
    if (upErr) return json({ error: upErr.message }, 403)
    replyTo = b.replyTo
  } else if (kind === 'invoice') {
    const { data: j, error } = await supabase.from('jobs').select('*').eq('id', id).single()
    if (error || !j) return json({ error: 'Job not found' }, 404)
    businessId = j.business_id
    link = `${origin}/i/${j.public_token}`
    to = j.email
    const b = await bizName(j.business_id)
    const paid = j.pay_state === 'paid'
    subject = paid ? `Receipt from ${b.name} — ${aud(j.price)} paid` : `Invoice from ${b.name} — ${aud(j.price)}`
    html = layout(
      b.name,
      paid ? `Thanks — ${aud(j.price)} received` : `Invoice INV-${String(j.num).replace(/^[A-Z]+-/, '')} · ${aud(j.price)}`,
      `<p style="margin:0 0 10px">Hi ${esc(String(j.customer).split(' ')[0])},</p>
       <p style="margin:0;color:#16374F;line-height:1.5">${paid ? 'Here is your receipt' : 'Here is your invoice'} for <b>${esc(j.service || 'your recent job')}</b>${j.address ? ` at ${esc(j.address)}` : ''}.</p>`,
      { label: paid ? 'View receipt' : 'View & pay invoice', url: link },
    )
    const { error: upErr } = await supabase.from('jobs').update({ invoice_sent_at: now }).eq('id', id)
    if (upErr) return json({ error: upErr.message }, 403)
    replyTo = b.replyTo
  } else if (kind === 'invite') {
    const { data: inv, error } = await supabase.from('invites').select('*').eq('id', id).single()
    if (error || !inv) return json({ error: 'Invite not found' }, 404)
    businessId = inv.business_id
    link = `${origin}/join/${inv.token}`
    to = inv.email
    const b = await bizName(inv.business_id)
    subject = `You're invited to join ${b.name} on Home Service Ops`
    html = layout(
      b.name,
      `Join ${b.name}`,
      `<p style="margin:0;color:#16374F;line-height:1.5">You've been invited as <b>${inv.role === 'crew' ? 'crew' : 'an office admin'}</b>. ${
        inv.role === 'crew' ? 'You’ll see your jobs for the day, get directions, run the on-site timer and upload before/after photos.' : 'You’ll be able to manage jobs, quotes, clients and crew.'
      }</p><p style="margin:10px 0 0;color:#5A7189">This link expires in 7 days.</p>`,
      { label: 'Accept invite', url: link },
    )
    const { error: upErr } = await supabase.from('invites').update({ sent_at: now }).eq('id', id)
    if (upErr) return json({ error: upErr.message }, 403)
  } else {
    return json({ error: 'Unknown kind' }, 400)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!to) return json({ emailed: false, link, business_id: businessId, message: 'No email on file — link copied to clipboard' })
  if (!apiKey) return json({ emailed: false, link, business_id: businessId, message: 'Email not configured — link copied to clipboard' })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') || 'Home Service Ops <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      reply_to: replyTo,
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    return json({ emailed: false, link, message: `Email failed (${res.status}) — link copied instead`, detail })
  }
  return json({ emailed: true, to, link })
})
