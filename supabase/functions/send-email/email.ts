// Email building blocks shared by every message the app sends.
// Pure TypeScript (no Deno APIs) so it is unit-tested with vitest from the app (src/lib/email.test.ts).

export const DEFAULT_APP_URL = 'https://home-service-ops.vercel.app'
export const DEFAULT_EMAIL_DOMAIN = 'localservicepro.com.au'

export interface Brand {
  name: string
  email?: string | null
  phone?: string | null
  logoUrl?: string | null
}

export interface LineSummary {
  name: string
  qty: number
  unit_price: number
  kind?: string
}

export interface Email {
  from: string
  replyTo?: string
  to: string
  subject: string
  html: string
  text: string
}

const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(n) || 0)

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Base URL for every link in an email. Never the caller's origin (could be a preview/sandbox URL). */
export function appUrl(env: string | undefined) {
  const u = (env || DEFAULT_APP_URL).trim().replace(/\/+$/, '')
  return /^https:\/\//.test(u) ? u : DEFAULT_APP_URL
}

/** "Coastal Lawn Co" <hello@domain> — sender name is the business, address is ours (verified domain). */
export function fromHeader(businessName: string, address: string) {
  const name = businessName.replace(/["\r\n<>]/g, '').trim().slice(0, 70) || 'Home Service Ops'
  return `"${name}" <${address}>`
}

export const senderAddress = (fromAddressEnv?: string, domainEnv?: string) =>
  fromAddressEnv?.trim() || `hello@${(domainEnv || DEFAULT_EMAIL_DOMAIN).trim()}`

export const firstName = (s: string) => String(s || '').trim().split(/\s+/)[0] || 'there'

function linesTable(lines: LineSummary[], total: number, gst: boolean) {
  const rows = lines
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #EEF3F8;font-size:14px;color:#08172B">${l.kind === 'addon' ? '&#8627; ' : ''}${esc(l.name)}${
          Number(l.qty) !== 1 ? ` <span style="color:#8FA3BC">&times; ${esc(l.qty)}</span>` : ''
        }</td>
        <td style="padding:8px 0;border-bottom:1px solid #EEF3F8;font-size:14px;color:#08172B;text-align:right;white-space:nowrap">${aud(
          Number(l.qty) * Number(l.unit_price),
        )}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;border-collapse:collapse">${rows}
    <tr><td style="padding:12px 0 0;font-size:15px;font-weight:800;color:#08172B">Total${gst ? ' <span style="font-weight:600;color:#8FA3BC;font-size:12px">inc GST</span>' : ''}</td>
    <td style="padding:12px 0 0;font-size:18px;font-weight:800;color:#08172B;text-align:right">${aud(total)}</td></tr></table>`
}

function linesText(lines: LineSummary[], total: number, gst: boolean) {
  return (
    lines.map((l) => `  ${l.kind === 'addon' ? '- ' : ''}${l.name}${Number(l.qty) !== 1 ? ` x${l.qty}` : ''}  ${aud(Number(l.qty) * Number(l.unit_price))}`).join('\n') +
    `\n  Total${gst ? ' (inc GST)' : ''}: ${aud(total)}`
  )
}

/** Navy header, white card, one gradient button. Table-based so it survives Outlook/Gmail. */
export function layout(brand: Brand, heading: string, bodyHtml: string, cta: { label: string; url: string }, footerNote?: string) {
  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" width="44" height="44" style="display:block;border-radius:10px;margin-bottom:12px;object-fit:cover">`
    : ''
  const contact = [brand.phone, brand.email].filter(Boolean).map(esc).join(' &middot; ')
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#F4F8FC;font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Arial,sans-serif;color:#08172B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F8FC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="background:#08172B;background-image:linear-gradient(150deg,#08172B,#0E2942);border-radius:18px 18px 0 0;padding:24px 24px 22px;color:#ffffff">
    ${logo}<div style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:10px;letter-spacing:2px;color:#35C6F4;text-transform:uppercase">${esc(brand.name)}</div>
    <div style="font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-0.4px;margin-top:6px;color:#ffffff">${esc(heading)}</div>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid #DCE7F1;border-top:0;border-radius:0 0 18px 18px;padding:22px 24px 24px;font-size:15px;line-height:1.5;color:#16374F">
    ${bodyHtml}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="border-radius:12px;background:#0C6FD0;background-image:linear-gradient(135deg,#0C6FD0,#35C6F4)">
      <a href="${esc(cta.url)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${esc(cta.label)}</a>
    </td></tr></table>
    <p style="margin:18px 0 0;font-size:12px;color:#8FA3BC;word-break:break-all">Button not working? Copy this link: <a href="${esc(cta.url)}" style="color:#0C6FD0">${esc(cta.url)}</a></p>
    ${footerNote ? `<p style="margin:10px 0 0;font-size:12px;color:#8FA3BC">${esc(footerNote)}</p>` : ''}
  </td></tr>
  <tr><td align="center" style="padding:16px 8px 0;font-size:11px;color:#8FA3BC">${contact ? `${esc(brand.name)} &middot; ${contact}<br>` : ''}Sent with Home Service Ops by Local Service Pro</td></tr>
</table></td></tr></table></body></html>`
}

function textLayout(brand: Brand, heading: string, body: string, cta: { label: string; url: string }, footerNote?: string) {
  const contact = [brand.phone, brand.email].filter(Boolean).join(' · ')
  return [brand.name, heading, '', body, '', `${cta.label}: ${cta.url}`, footerNote ? `\n${footerNote}` : '', '', '—', contact ? `${brand.name} · ${contact}` : brand.name, 'Sent with Home Service Ops by Local Service Pro']
    .filter((l) => l !== undefined)
    .join('\n')
}

export function quoteEmail(p: {
  brand: Brand
  customer: string
  num: string
  address?: string | null
  note?: string | null
  lines: LineSummary[]
  total: number
  gst: boolean
  validUntil?: string | null
  link: string
}) {
  const hi = `Hi ${firstName(p.customer)},`
  const intro = `Thanks for asking ${p.brand.name} to quote${p.address ? ` for ${p.address}` : ''}. Here's a summary — tap below to see the full quote and accept or decline online.`
  const valid = p.validUntil ? `This quote is valid until ${new Date(`${p.validUntil}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.` : undefined
  const cta = { label: 'View & accept quote', url: p.link }
  const heading = `Quote ${p.num} · ${aud(p.total)}`
  return {
    subject: `Your quote from ${p.brand.name} — ${aud(p.total)}`,
    html: layout(
      p.brand,
      heading,
      `<p style="margin:0 0 10px">${esc(hi)}</p><p style="margin:0">${esc(intro)}</p>${linesTable(p.lines, p.total, p.gst)}${
        p.note ? `<p style="margin:14px 0 0;padding:12px 14px;background:#F5FAFF;border:1px solid #DCE7F1;border-radius:12px;font-size:14px">${esc(p.note)}</p>` : ''
      }`,
      cta,
      valid,
    ),
    text: textLayout(p.brand, heading, `${hi}\n\n${intro}\n\n${linesText(p.lines, p.total, p.gst)}${p.note ? `\n\nNote: ${p.note}` : ''}`, cta, valid),
  }
}

export function invoiceEmail(p: {
  brand: Brand
  customer: string
  invoiceNum: string
  service?: string | null
  address?: string | null
  lines: LineSummary[]
  total: number
  balance: number
  gst: boolean
  paid: boolean
  dueDate?: string | null
  link: string
}) {
  const hi = `Hi ${firstName(p.customer)},`
  const what = `${p.service || 'your recent job'}${p.address ? ` at ${p.address}` : ''}`
  const intro = p.paid ? `Thanks for your payment — here's your receipt for ${what}.` : `Here's your invoice for ${what}.`
  const due = !p.paid && p.dueDate ? `Payment is due by ${p.dueDate}. Bank details and payment options are on the invoice.` : undefined
  const cta = { label: p.paid ? 'View receipt' : 'View & pay invoice', url: p.link }
  const heading = p.paid ? `Receipt ${p.invoiceNum} · ${aud(p.total)} paid` : `Invoice ${p.invoiceNum} · ${aud(p.balance)} due`
  return {
    subject: p.paid ? `Receipt from ${p.brand.name} — ${aud(p.total)} paid` : `Invoice ${p.invoiceNum} from ${p.brand.name} — ${aud(p.balance)} due`,
    html: layout(p.brand, heading, `<p style="margin:0 0 10px">${esc(hi)}</p><p style="margin:0">${esc(intro)}</p>${linesTable(p.lines, p.total, p.gst)}`, cta, due),
    text: textLayout(p.brand, heading, `${hi}\n\n${intro}\n\n${linesText(p.lines, p.total, p.gst)}`, cta, due),
  }
}

export function inviteEmail(p: { brand: Brand; role: 'admin' | 'crew'; link: string }) {
  const body =
    p.role === 'crew'
      ? `You've been invited to join ${p.brand.name} as crew. You'll see your jobs for the day, get directions, run the on-site timer and upload before/after photos.`
      : `You've been invited to join ${p.brand.name} as an office admin. You'll be able to manage jobs, quotes, clients and crew.`
  const cta = { label: 'Accept invite', url: p.link }
  const note = 'This invite link expires in 7 days.'
  return {
    subject: `You're invited to join ${p.brand.name} on Home Service Ops`,
    html: layout(p.brand, `Join ${p.brand.name}`, `<p style="margin:0">${esc(body)}</p>`, cta, note),
    text: textLayout(p.brand, `Join ${p.brand.name}`, body, cta, note),
  }
}

export function passwordResetEmail(p: { link: string }) {
  const brand: Brand = { name: 'Home Service Ops' }
  const body = 'We got a request to reset the password for your Home Service Ops account. Tap below to choose a new one.'
  const cta = { label: 'Reset password', url: p.link }
  const note = "This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email — your password won't change."
  return {
    subject: 'Reset your Home Service Ops password',
    html: layout(brand, 'Reset your password', `<p style="margin:0">${esc(body)}</p>`, cta, note),
    text: textLayout(brand, 'Reset your password', body, cta, note),
  }
}

export function quoteResponseEmail(p: {
  brand: Brand
  customer: string
  num: string
  total: number
  accepted: boolean
  reason?: string | null
  preferredDate?: string | null
  link: string
}) {
  const heading = p.accepted ? `${p.customer} accepted ${p.num}` : `${p.customer} declined ${p.num}`
  const body = p.accepted
    ? `Good news — ${p.customer} accepted quote ${p.num} for ${aud(p.total)}.${p.preferredDate ? ` They'd like ${p.preferredDate}.` : ''} Pick a day and crew to book it in.`
    : `${p.customer} declined quote ${p.num} (${aud(p.total)}).${p.reason ? ` Their reason: "${p.reason}"` : ' They didn’t give a reason.'}`
  const cta = { label: p.accepted ? 'Book the job' : 'Open quote', url: p.link }
  return {
    subject: p.accepted ? `✅ Quote ${p.num} accepted — ${aud(p.total)}` : `Quote ${p.num} declined`,
    html: layout(p.brand, heading, `<p style="margin:0">${esc(body)}</p>`, cta),
    text: textLayout(p.brand, heading, body, cta),
  }
}
