import { describe, expect, it } from 'vitest'
import {
  appUrl,
  fromHeader,
  invoiceEmail,
  inviteEmail,
  passwordResetEmail,
  quoteEmail,
  quoteResponseEmail,
  senderAddress,
} from '../../supabase/functions/send-email/email'

const brand = { name: 'Coastal Lawn Co.', email: 'office@coastal.example', phone: '0400 000 100', logoUrl: null }
const lines = [
  { name: 'Lawn mow — standard block', qty: 1, unit_price: 75, kind: 'service' },
  { name: 'Edging', qty: 1, unit_price: 15, kind: 'addon' },
]

describe('links and sender', () => {
  it('always uses the live app URL, never a preview/sandbox origin', () => {
    expect(appUrl(undefined)).toBe('https://home-service-ops.vercel.app')
    expect(appUrl('https://app.example.com.au/')).toBe('https://app.example.com.au')
    expect(appUrl('http://localhost:3000')).toBe('https://home-service-ops.vercel.app')
  })
  it('sends as the business name from our verified domain', () => {
    expect(fromHeader('Coastal Lawn Co.', senderAddress(undefined, undefined))).toBe('"Coastal Lawn Co." <hello@localservicepro.com.au>')
    expect(fromHeader('Evil"\r\nBcc: x', 'hello@a.com')).toBe('"EvilBcc: x" <hello@a.com>')
    expect(senderAddress(undefined, 'mail.example.com')).toBe('hello@mail.example.com')
  })
})

describe('templates', () => {
  const q = quoteEmail({ brand, customer: 'Sophie Nguyen', num: 'Q-501', lines, total: 99, gst: true, validUntil: '2026-10-26', link: 'https://home-service-ops.vercel.app/q/abc', note: '<b>hi</b>' })
  it('quote: one button, summary, plain text, escaped content', () => {
    expect(q.subject).toBe('Your quote from Coastal Lawn Co. — $99.00')
    expect(q.html.match(/View &amp; accept quote|View & accept quote/g)?.length).toBeGreaterThan(0)
    expect(q.html).toContain('https://home-service-ops.vercel.app/q/abc')
    expect(q.html).not.toContain('<b>hi</b>')
    expect(q.text).toContain('View & accept quote: https://home-service-ops.vercel.app/q/abc')
    expect(q.text).toContain('Total (inc GST): $99.00')
    expect(q.text).toContain('Hi Sophie,')
  })
  it('invoice: due vs paid wording', () => {
    const due = invoiceEmail({ brand, customer: 'Sophie', invoiceNum: 'INV-1016', lines, total: 99, balance: 30, gst: true, paid: false, dueDate: '3 October 2026', link: 'https://x.app/i/t' })
    expect(due.subject).toContain('$30.00 due')
    expect(due.text).toContain('View & pay invoice: https://x.app/i/t')
    const paid = invoiceEmail({ brand, customer: 'Sophie', invoiceNum: 'INV-1016', lines, total: 99, balance: 0, gst: true, paid: true, link: 'https://x.app/i/t' })
    expect(paid.subject).toContain('Receipt')
    expect(paid.text).toContain('View receipt')
  })
  it('invite, reset and response emails carry their link in both parts', () => {
    for (const m of [
      inviteEmail({ brand, role: 'crew', link: 'https://x.app/join/t' }),
      passwordResetEmail({ link: 'https://x.app/reset/t' }),
      quoteResponseEmail({ brand, customer: 'Grace', num: 'Q-7', total: 50, accepted: false, reason: 'Too pricey', link: 'https://x.app/quotes/1' }),
    ]) {
      const url = m.text.match(/https:\/\/x\.app\/\S+/)![0]
      expect(m.html).toContain(url)
    }
    expect(passwordResetEmail({ link: 'l' }).text).toContain('expires in 1 hour')
  })
})
