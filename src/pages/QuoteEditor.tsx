import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { loadAddons, loadClients, loadServices, upsertClientFrom } from '../lib/data'
import { copy, quoteLink, sendEmail } from '../lib/api'
import { dateLong, isoDate, relTime } from '../lib/format'
import { QUOTE_STATUS } from '../lib/status'
import { must, supabase } from '../lib/supabase'
import type { Client, Job, LineItem, Quote } from '../lib/types'
import { Icon } from '../components/Icon'
import { InvoiceLines } from '../components/job'
import { LineBuilder } from '../components/LineBuilder'
import { serviceSummary } from '../components/JobForm'
import { Confirm, Field, LoadingPage, MoneyInput, Spinner, Switch, useAction, useToast } from '../components/ui'

interface Draft {
  customer: string
  phone: string
  email: string
  address: string
  client_id: string | null
  line_items: LineItem[]
  gst: boolean
  discount: number
  note: string
  valid_until: string
  request_job_id: string | null
}

const in30 = () => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return isoDate(d)
}

export function QuoteEditorPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id
  const { bid } = useBiz()
  const navigate = useNavigate()
  const toast = useToast()
  const { busy, run } = useAction()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirm, setConfirm] = useState<null | 'delete' | 'convert'>(null)

  const { data, setData, loading, error } = useLoad(async () => {
    const [services, addons, clients] = await Promise.all([loadServices(bid), loadAddons(bid), loadClients(bid)])
    let quote: Quote | null = null
    let seed: Partial<Draft> = {}
    if (id) {
      quote = must(await supabase.from('quotes').select('*').eq('id', id).single()) as Quote
    } else {
      const jobId = params.get('job')
      const clientId = params.get('client')
      if (jobId) {
        const j = must(await supabase.from('jobs').select('*').eq('id', jobId).single()) as Job
        seed = {
          customer: j.customer,
          phone: j.phone || '',
          email: j.email || '',
          address: j.address || '',
          client_id: j.client_id,
          line_items: j.line_items,
          gst: j.gst,
          discount: j.discount,
          note: j.notes || '',
          request_job_id: j.id,
        }
      } else if (clientId) {
        const c = clients.find((x) => x.id === clientId)
        if (c) seed = { customer: c.name, phone: c.phone || '', email: c.email || '', address: c.addresses[0]?.line || '', client_id: c.id }
      }
    }
    const base: Draft = {
      customer: quote?.customer || '',
      phone: quote?.phone || '',
      email: quote?.email || '',
      address: quote?.address || '',
      client_id: quote?.client_id || null,
      line_items: quote?.line_items || [],
      gst: quote?.gst ?? true,
      discount: Number(quote?.discount) || 0,
      note: quote?.note || '',
      valid_until: quote?.valid_until || in30(),
      request_job_id: quote?.request_job_id || null,
      ...seed,
    }
    setDraft(base)
    return { services, addons, clients, quote }
  }, [bid, id])

  if (loading || !draft) return <LoadingPage />
  if (error || !data) return <div className="page"><div className="empty"><b>Quote not found</b></div></div>

  const quote = data.quote
  const editable = !quote || quote.status === 'Awaiting'
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p })
  const client = data.clients.find((c) => c.id === draft.client_id)

  const persist = async (): Promise<Quote> => {
    if (!draft.customer.trim()) throw new Error('Add a customer name')
    if (!draft.line_items.length) throw new Error('Add at least one service')
    const client_id = draft.client_id || (await upsertClientFrom(bid, { name: draft.customer, phone: draft.phone, email: draft.email, address: draft.address }))
    const row = {
      customer: draft.customer.trim(),
      phone: draft.phone || null,
      email: draft.email || null,
      address: draft.address || null,
      client_id,
      line_items: draft.line_items,
      gst: draft.gst,
      discount: draft.discount,
      note: draft.note || null,
      valid_until: draft.valid_until || null,
      request_job_id: draft.request_job_id,
    }
    const saved = quote
      ? (must(await supabase.from('quotes').update(row).eq('id', quote.id).select('*').single()) as Quote)
      : (must(await supabase.from('quotes').insert({ ...row, business_id: bid }).select('*').single()) as Quote)
    set({ client_id })
    return saved
  }

  const saveDraft = () =>
    run(async () => {
      const q = await persist()
      setData({ ...data, quote: q })
      if (isNew) navigate(`/quotes/${q.id}`, { replace: true })
    }, 'Quote saved')

  const send = () =>
    run(async () => {
      const q = editable ? await persist() : quote!
      if (!q.email && !draft.email) toast('No customer email — link copied so you can text it')
      const r = await sendEmail('quote', q.id, quoteLink(q.public_token))
      if (q.request_job_id) await supabase.from('jobs').update({ status: 'Quote Sent' }).eq('id', q.request_job_id).eq('status', 'New')
      setData({ ...data, quote: { ...q, sent_at: new Date().toISOString() } })
      toast(r.message)
      if (isNew) navigate(`/quotes/${q.id}`, { replace: true })
    })

  const convert = async () => {
    if (!quote) return
    await run(async () => {
      let jobId = quote.request_job_id
      const patch = {
        status: 'Job Scheduled' as const,
        line_items: quote.line_items,
        gst: quote.gst,
        discount: quote.discount,
        service: serviceSummary(quote.line_items),
        quote_id: quote.id,
      }
      if (jobId) {
        must(await supabase.from('jobs').update(patch).eq('id', jobId))
      } else {
        const j = must(
          await supabase
            .from('jobs')
            .insert({
              ...patch,
              business_id: bid,
              customer: quote.customer,
              phone: quote.phone,
              email: quote.email,
              address: quote.address,
              client_id: quote.client_id,
              notes: quote.note,
              source: 'quote',
            })
            .select('id')
            .single(),
        ) as { id: string }
        jobId = j.id
      }
      must(await supabase.from('quotes').update({ status: 'Converted', request_job_id: jobId, responded_at: new Date().toISOString() }).eq('id', quote.id))
      toast('Converted to a job — pick a date and crew')
      navigate(`/jobs/${jobId}`)
    })
  }

  const tone = quote ? QUOTE_STATUS[quote.status] : null

  return (
    <div className="page page-narrow">
      <section className="hero">
        <div className="row-between">
          <button className="hero-btn" onClick={() => navigate(-1)} aria-label="Back">
            <Icon name="back" />
          </button>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--on-navy)' }}>
            {quote ? `#${quote.num}` : 'NEW QUOTE'}
          </span>
          <span style={{ width: 42 }} />
        </div>
        {quote && tone && (
          <span className="pill" style={{ marginTop: 14, color: '#fff', background: tone.c, padding: '5px 12px', fontSize: 11 }}>
            {quote.status}
          </span>
        )}
        <h1 style={{ fontSize: 22, marginTop: 10 }}>{draft.customer || 'Quote builder'}</h1>
        <div className="sub">
          {quote?.sent_at ? `Sent ${relTime(quote.sent_at)}` : 'Not sent yet'}
          {quote?.viewed_at ? ` · Viewed ${relTime(quote.viewed_at)}` : ''}
          {quote?.responded_at ? ` · ${quote.status} ${relTime(quote.responded_at)}` : ''}
        </div>
      </section>

      {quote?.status === 'Declined' && (
        <div className="note warn" style={{ marginBottom: 14 }}>
          <b>Declined.</b> {quote.decline_reason ? `“${quote.decline_reason}”` : 'No reason given.'}
        </div>
      )}
      {(quote?.status === 'Accepted' || quote?.status === 'Converted') && quote.request_job_id && (
        <div className="note" style={{ marginBottom: 14 }}>
          {quote.status === 'Accepted' ? 'Customer accepted — the job is booked.' : 'Converted to a job.'}{' '}
          <Link to={`/jobs/${quote.request_job_id}`}>Open job →</Link>
        </div>
      )}

      {editable ? (
        <div className="stack">
          <div className="card rise">
            <div className="section-label" style={{ marginBottom: 12 }}>
              Customer
            </div>
            <div className="form-grid cols-2">
              {data.clients.length > 0 && (
                <Field label="Existing client" className="span-2">
                  <select
                    className="select"
                    value={draft.client_id || ''}
                    onChange={(e) => {
                      const c: Client | undefined = data.clients.find((x) => x.id === e.target.value)
                      if (!c) return set({ client_id: null })
                      set({ client_id: c.id, customer: c.name, phone: c.phone || '', email: c.email || '', address: c.addresses[0]?.line || draft.address })
                    }}
                  >
                    <option value="">— New customer —</option>
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Name" className="span-2">
                <input className="input" value={draft.customer} onChange={(e) => set({ customer: e.target.value })} />
              </Field>
              <Field label="Email (quote is sent here)">
                <input className="input" type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className="input" inputMode="tel" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
              <Field label="Property address" className="span-2">
                {client && client.addresses.length > 1 ? (
                  <select className="select" value={draft.address} onChange={(e) => set({ address: e.target.value })}>
                    {client.addresses.map((a) => (
                      <option key={a.line}>{a.line}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
                )}
              </Field>
            </div>
          </div>

          <div className="card rise rise-1">
            <div className="section-label" style={{ marginBottom: 12 }}>
              Services & add-ons
            </div>
            <LineBuilder items={draft.line_items} onChange={(line_items) => set({ line_items })} services={data.services} addons={data.addons} />
          </div>

          <div className="card rise rise-2">
            <div className="form-grid cols-2">
              <Field label="Discount ($, ex GST)">
                <MoneyInput value={draft.discount} onChange={(discount) => set({ discount })} />
              </Field>
              <div className="field">
                <span>GST</span>
                <div className="row" style={{ height: 46 }}>
                  <Switch checked={draft.gst} onChange={(gst) => set({ gst })} label="Charge GST" />
                  <span style={{ fontWeight: 600 }}>{draft.gst ? 'Add 10% GST' : 'No GST'}</span>
                </div>
              </div>
              <Field label="Valid until">
                <input className="input" type="date" value={draft.valid_until} onChange={(e) => set({ valid_until: e.target.value })} />
              </Field>
              <Field label="Note to customer" className="span-2">
                <textarea className="textarea" value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="Thanks for the opportunity! Price includes…" />
              </Field>
            </div>
          </div>

          <div className="card rise rise-3">
            <div className="section-label" style={{ marginBottom: 10 }}>
              Preview
            </div>
            <InvoiceLines items={draft.line_items} discount={draft.discount} gst={draft.gst} caption="Quote total" />
          </div>
        </div>
      ) : (
        <div className="card rise">
          <div className="kv">
            <span>Customer</span>
            <span>{quote!.customer}</span>
          </div>
          <div className="kv">
            <span>Email</span>
            <span>{quote!.email || '—'}</span>
          </div>
          <div className="kv">
            <span>Address</span>
            <span>{quote!.address || '—'}</span>
          </div>
          <div className="kv">
            <span>Valid until</span>
            <span>{dateLong(quote!.valid_until)}</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <InvoiceLines items={quote!.line_items} discount={quote!.discount} gst={quote!.gst} caption="Quote total" />
          </div>
        </div>
      )}

      {quote && (
        <div className="row wrap" style={{ marginTop: 14 }}>
          <a className="btn btn-ghost btn-sm" href={quoteLink(quote.public_token)} target="_blank" rel="noreferrer">
            <Icon name="link" /> Customer view
          </a>
          <button className="btn btn-ghost btn-sm" onClick={async () => (await copy(quoteLink(quote.public_token))) && toast('Quote link copied')}>
            <Icon name="copy" /> Copy link
          </button>
          {(quote.status === 'Awaiting' || quote.status === 'Accepted') && !(quote.status === 'Accepted' && quote.request_job_id) && (
            <button className="btn btn-soft btn-sm" onClick={() => setConfirm('convert')}>
              <Icon name="swap" /> Convert to job
            </button>
          )}
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm('delete')}>
            <Icon name="trash" /> Delete
          </button>
        </div>
      )}

      {editable && (
        <div className="action-bar">
          <button className="btn btn-ghost" onClick={saveDraft} disabled={busy}>
            Save draft
          </button>
          <button className="btn btn-primary btn-lg grow" onClick={send} disabled={busy}>
            {busy ? <Spinner /> : (
              <>
                <Icon name="send" /> {quote?.sent_at ? 'Save & resend' : 'Send quote'}
              </>
            )}
          </button>
        </div>
      )}

      {confirm === 'convert' && (
        <Confirm
          title="Convert to a job?"
          body="Books this quote in as a scheduled job (use this when the customer said yes by phone)."
          confirmLabel="Convert"
          onClose={() => setConfirm(null)}
          onConfirm={convert}
        />
      )}
      {confirm === 'delete' && quote && (
        <Confirm
          title="Delete quote?"
          body={`${quote.num} will be removed and its link will stop working.`}
          confirmLabel="Delete"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            must(await supabase.from('quotes').delete().eq('id', quote.id))
            toast('Quote deleted')
            navigate('/jobs?filter=quotes', { replace: true })
          }}
        />
      )}
    </div>
  )
}
