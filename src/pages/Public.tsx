import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { abn, dateLong, isoDate, money } from '../lib/format'
import { PAY_METHOD_LABEL, QUOTE_STATUS } from '../lib/status'
import type { JobStatus, LineItem, PayMethod, PayState, PublicBusiness, QuoteStatus } from '../lib/types'
import { BrandMark, Icon } from '../components/Icon'
import { InvoiceLines } from '../components/job'
import { Field, LoadingPage, Pill, Spinner } from '../components/ui'

interface PublicQuote {
  num: string
  status: QuoteStatus
  customer: string
  address: string | null
  line_items: LineItem[]
  price: number
  gst: boolean
  discount: number
  note: string | null
  valid_until: string | null
  sent_at: string | null
  created_at: string
  decline_reason: string | null
  business: PublicBusiness
}

interface PublicInvoice {
  num: string
  status: JobStatus
  customer: string
  address: string | null
  service: string | null
  line_items: LineItem[]
  price: number
  gst: boolean
  discount: number
  scheduled_date: string | null
  invoice_sent_at: string | null
  created_at: string
  pay_state: PayState
  pay_method: PayMethod | null
  paid_at: string | null
  business: PublicBusiness
}

function PublicFrame({ biz, kicker, title, children, right }: { biz: PublicBusiness; kicker: string; title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="public-wrap">
      <div className="public-top">
        <div className="public-biz">
          {biz.logo_url ? <img src={biz.logo_url} alt="" /> : <BrandMark size={48} />}
          <div className="grow">
            <div style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{biz.name}</div>
            <div style={{ color: 'var(--on-navy)', fontSize: 12, fontWeight: 600 }}>
              {[biz.phone, biz.email].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 720, margin: '26px auto 0' }} className="row-between">
          <div>
            <div className="mono-label">{kicker}</div>
            <h1 style={{ color: '#fff', fontSize: 26, marginTop: 4 }}>{title}</h1>
          </div>
          {right}
        </div>
      </div>
      <div className="public-body">
        {children}
        <div className="center faint no-print" style={{ fontSize: 11.5, marginTop: 24 }}>
          Sent with Home Service Ops by Local Service Pro
        </div>
      </div>
    </div>
  )
}

function BizBlock({ biz, customer, address, rows }: { biz: PublicBusiness; customer: string; address: string | null; rows: [string, string][] }) {
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 16 }}>
      <div>
        <div className="section-label" style={{ marginBottom: 6 }}>
          For
        </div>
        <div style={{ fontWeight: 700 }}>{customer}</div>
        {address && <div className="muted" style={{ fontSize: 13 }}>{address}</div>}
      </div>
      <div>
        <div className="section-label" style={{ marginBottom: 6 }}>
          From
        </div>
        <div style={{ fontWeight: 700 }}>{biz.name}</div>
        {biz.abn && <div className="muted" style={{ fontSize: 13 }}>ABN {abn(biz.abn)}</div>}
        {biz.address && <div className="muted" style={{ fontSize: 13 }}>{biz.address}</div>}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        {rows.map(([k, v]) => (
          <div key={k} className="kv">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NotFound({ what }: { what: string }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card stack center">
        <h2>{what} not found</h2>
        <p className="muted">This link may have expired or been replaced. Contact the business that sent it.</p>
      </div>
    </div>
  )
}

export function PublicQuotePage() {
  const { token = '' } = useParams()
  const [q, setQ] = useState<PublicQuote | null | undefined>(undefined)
  const [mode, setMode] = useState<null | 'accept' | 'decline'>(null)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = () => supabase.rpc('get_public_quote', { tok: token }).then(({ data }) => setQ((data as PublicQuote) || null))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (q === undefined) return <LoadingPage />
  if (!q) return <NotFound what="Quote" />

  const respond = async (accept: boolean) => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('respond_to_quote', {
      tok: token,
      accept,
      reason: accept ? null : reason || null,
      preferred_date: accept && date ? date : null,
    })
    setBusy(false)
    if (error) return setErr(error.message)
    setMode(null)
    load()
  }
  const expired = q.valid_until && q.valid_until < isoDate() && q.status === 'Awaiting'
  const tone = QUOTE_STATUS[q.status]

  return (
    <PublicFrame
      biz={q.business}
      kicker={`Quote ${q.num}`}
      title={money(q.price)}
      right={
        <Pill c={tone.c} bg={tone.bg}>
          {q.status === 'Awaiting' ? 'Awaiting your reply' : q.status}
        </Pill>
      }
    >
      <div className="card rise">
        <BizBlock
          biz={q.business}
          customer={q.customer}
          address={q.address}
          rows={[
            ['Quote date', dateLong(q.sent_at || q.created_at)],
            ['Valid until', dateLong(q.valid_until)],
          ]}
        />
        <InvoiceLines items={q.line_items} discount={q.discount} gst={q.gst} caption="Quote total" />
        {q.note && (
          <div className="note" style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>
            {q.note}
          </div>
        )}
      </div>

      <div className="card rise rise-1 no-print" style={{ marginTop: 14 }}>
        {q.status === 'Awaiting' && !expired && mode === null && (
          <div className="stack">
            <div style={{ fontWeight: 800, fontSize: 17 }}>Happy to go ahead?</div>
            <p className="muted">Accepting books the job in — {q.business.name} will confirm the time with you.</p>
            <div className="row">
              <button className="btn btn-ghost grow" onClick={() => setMode('decline')}>
                Decline
              </button>
              <button className="btn btn-primary btn-lg grow" onClick={() => setMode('accept')}>
                <Icon name="check" /> Accept quote
              </button>
            </div>
          </div>
        )}
        {q.status === 'Awaiting' && expired && <div className="note warn">This quote expired on {dateLong(q.valid_until)}. Contact {q.business.name} for an updated price.</div>}
        {mode === 'accept' && (
          <div className="stack">
            <div style={{ fontWeight: 800, fontSize: 17 }}>Accept {money(q.price)}</div>
            <Field label="Preferred date (optional)">
              <input className="input" type="date" min={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {err && <div className="error-text">{err}</div>}
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setMode(null)}>
                Back
              </button>
              <button className="btn btn-primary btn-lg grow" disabled={busy} onClick={() => respond(true)}>
                {busy ? <Spinner /> : 'Confirm & book'}
              </button>
            </div>
          </div>
        )}
        {mode === 'decline' && (
          <div className="stack">
            <div style={{ fontWeight: 800, fontSize: 17 }}>Decline this quote</div>
            <Field label="Mind telling us why? (optional)">
              <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Price, timing, went with someone else…" />
            </Field>
            {err && <div className="error-text">{err}</div>}
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setMode(null)}>
                Back
              </button>
              <button className="btn btn-danger btn-lg grow" disabled={busy} onClick={() => respond(false)}>
                {busy ? <Spinner /> : 'Decline quote'}
              </button>
            </div>
          </div>
        )}
        {(q.status === 'Accepted' || q.status === 'Converted') && (
          <div className="row">
            <span className="avatar lg" style={{ background: 'var(--green-2)' }}>
              ✓
            </span>
            <div>
              <div style={{ fontWeight: 800 }}>You’re booked in!</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {q.business.name} will be in touch to confirm the day{q.business.phone ? ` — or call ${q.business.phone}` : ''}.
              </div>
            </div>
          </div>
        )}
        {q.status === 'Declined' && (
          <div className="muted">
            You declined this quote{q.decline_reason ? `: “${q.decline_reason}”` : '.'} Changed your mind? Contact {q.business.name}
            {q.business.phone ? ` on ${q.business.phone}` : ''}.
          </div>
        )}
      </div>
    </PublicFrame>
  )
}

export function PublicInvoicePage() {
  const { token = '' } = useParams()
  const [inv, setInv] = useState<PublicInvoice | null | undefined>(undefined)
  useEffect(() => {
    supabase.rpc('get_public_invoice', { tok: token }).then(({ data }) => setInv((data as PublicInvoice) || null))
  }, [token])
  if (inv === undefined) return <LoadingPage />
  if (!inv) return <NotFound what="Invoice" />
  const b = inv.business
  const paid = inv.pay_state === 'paid'
  const issued = inv.invoice_sent_at || inv.created_at
  const due = new Date(issued)
  due.setDate(due.getDate() + (b.payment_terms_days ?? 7))
  const methods = b.payment_methods || []

  return (
    <PublicFrame
      biz={b}
      kicker={`Tax invoice INV-${inv.num.replace(/^J-/, '')}`}
      title={money(inv.price)}
      right={paid ? <Pill c="var(--green)" bg="var(--green-tint)">Paid</Pill> : <Pill c="var(--amber)" bg="var(--amber-tint)">Due {dateLong(isoDate(due))}</Pill>}
    >
      <div className="card rise">
        <BizBlock
          biz={b}
          customer={inv.customer}
          address={inv.address}
          rows={[
            ['Invoice date', dateLong(issued)],
            ['Job', `${inv.num}${inv.service ? ` · ${inv.service}` : ''}`],
            ...(inv.scheduled_date ? ([['Service date', dateLong(inv.scheduled_date)]] as [string, string][]) : []),
            [paid ? 'Paid' : 'Due date', paid ? `${dateLong(inv.paid_at)}${inv.pay_method ? ` · ${PAY_METHOD_LABEL[inv.pay_method]}` : ''}` : dateLong(isoDate(due))],
          ]}
        />
        <InvoiceLines
          items={inv.line_items}
          discount={inv.discount}
          gst={inv.gst}
          caption={paid ? 'Total paid' : 'Amount due'}
          footer={
            paid ? (
              <div className="paid-banner">
                <i>✓</i> Paid — thank you!
              </div>
            ) : null
          }
        />
      </div>

      {!paid && (
        <div className="card rise rise-1" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 10 }}>How to pay</div>
          {methods.includes('online') && b.online_payment_url && (
            <a className="btn btn-primary btn-lg btn-block no-print" href={b.online_payment_url} target="_blank" rel="noreferrer" style={{ marginBottom: 14 }}>
              Pay {money(inv.price)} by card
            </a>
          )}
          {methods.includes('bank') && b.bank_bsb && (
            <div style={{ marginBottom: 10 }}>
              <div className="section-label" style={{ marginBottom: 4 }}>
                Bank transfer
              </div>
              <div className="kv">
                <span>Account name</span>
                <span>{b.bank_account_name}</span>
              </div>
              <div className="kv">
                <span>BSB</span>
                <span className="mono">{b.bank_bsb}</span>
              </div>
              <div className="kv">
                <span>Account</span>
                <span className="mono">{b.bank_account_number}</span>
              </div>
              <div className="kv">
                <span>Reference</span>
                <span className="mono">{inv.num}</span>
              </div>
            </div>
          )}
          {methods.includes('cash') && <div className="muted" style={{ fontSize: 13 }}>Cash is welcome on the day.</div>}
        </div>
      )}
      <div className="row no-print" style={{ justifyContent: 'center', marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
          Print / save PDF
        </button>
      </div>
    </PublicFrame>
  )
}
