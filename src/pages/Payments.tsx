import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { byId, loadJobs, loadQuotes } from '../lib/data'
import { must, supabase } from '../lib/supabase'
import type { Payment } from '../lib/types'
import { dateShort, money, moneyShort } from '../lib/format'
import { PAY_METHODS, PAY_METHOD_LABEL } from '../lib/status'
import { Icon } from '../components/Icon'
import { Empty, LoadingPage, Pill, QuotePill, StatusPill } from '../components/ui'

const TABS = ['Transactions', 'Invoices', 'Pending', 'Quotes'] as const
type Tab = (typeof TABS)[number]

export function PaymentsPage() {
  const { bid } = useBiz()
  const [tab, setTab] = useState<Tab>('Transactions')
  const { data, loading } = useLoad(async () => {
    const [jobs, quotes, payments] = await Promise.all([
      loadJobs(bid),
      loadQuotes(bid),
      supabase.from('payments').select('*').eq('business_id', bid).order('paid_at', { ascending: false }).then(must),
    ])
    return { jobs, quotes, payments: payments as Payment[] }
  }, [bid])
  if (loading || !data) return <LoadingPage />

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const jobsById = byId(data.jobs)
  const monthPayments = data.payments.filter((p) => new Date(p.paid_at) >= monthStart)
  const collectedMonth = monthPayments.reduce((s, p) => s + Number(p.amount), 0)
  const due = (j: (typeof data.jobs)[number]) => Math.max(0, Number(j.price) - Number(j.amount_paid))
  const pending = data.jobs.filter((j) => j.pay_state !== 'paid' && (j.status === 'Done' || j.invoice_sent_at) && j.status !== 'Cancelled')
  const outstanding = pending.reduce((s, j) => s + due(j), 0)
  const invoices = data.jobs.filter((j) => j.invoice_sent_at).sort((a, b) => (b.invoice_sent_at || '').localeCompare(a.invoice_sent_at || ''))
  const openQuotes = data.quotes.filter((q) => q.status === 'Draft' || q.status === 'Sent')
  const quoted = openQuotes.reduce((s, q) => s + Number(q.price), 0)
  const byMethod = PAY_METHODS.map((m) => ({
    m,
    total: monthPayments.filter((p) => p.method === m).reduce((s, p) => s + Number(p.amount), 0),
  }))

  const rows = tab === 'Invoices' ? invoices : tab === 'Pending' ? pending : []

  return (
    <div className="page">
      <section className="hero">
        <div className="mono-label">{now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</div>
        <h1>Payments</h1>
        <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat live">
            <b>{moneyShort(collectedMonth)}</b>
            <span>Collected this month</span>
          </div>
          <button className="stat" style={{ cursor: 'pointer', font: 'inherit' }} onClick={() => setTab('Pending')}>
            <b>{moneyShort(outstanding)}</b>
            <span>Outstanding · {pending.length}</span>
          </button>
          <button className="stat" style={{ cursor: 'pointer', font: 'inherit' }} onClick={() => setTab('Quotes')}>
            <b>{moneyShort(quoted)}</b>
            <span>Quoted · {openQuotes.length}</span>
          </button>
        </div>
        {collectedMonth > 0 && (
          <div className="row wrap" style={{ marginTop: 14, gap: 16 }}>
            {byMethod.map((x) => (
              <span key={x.m} style={{ fontSize: 12, color: 'var(--on-navy)', fontWeight: 600 }}>
                {PAY_METHOD_LABEL[x.m]} <b style={{ color: '#fff' }}>{money(x.total)}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="list">
        {tab === 'Quotes' ? (
          <>
            {data.quotes.length === 0 && <Empty title="No quotes yet" action={<Link to="/quotes/new" className="btn btn-soft btn-sm">Build a quote</Link>} />}
            {data.quotes.map((q) => (
              <Link key={q.id} to={`/quotes/${q.id}`} className="item">
                <div className="grow">
                  <div className="item-title ellipsis">{q.customer}</div>
                  <div className="item-sub">
                    <span className="mono">{q.num}</span> · {q.sent_at ? `sent ${dateShort(q.sent_at)}` : 'draft'}
                  </div>
                </div>
                <QuotePill status={q.status} />
                <b className="num">{money(q.price)}</b>
              </Link>
            ))}
          </>
        ) : tab === 'Transactions' ? (
          <>
            {data.payments.length === 0 && <Empty title="No payments yet">Payments you record on jobs show up here.</Empty>}
            {data.payments.map((p) => {
              const j = jobsById[p.job_id]
              return (
                <Link key={p.id} to={`/jobs/${p.job_id}`} className="item">
                  <div className="avatar sq lg" style={{ background: 'var(--green-tint)', color: 'var(--green)' }}>
                    <Icon name="check" />
                  </div>
                  <div className="grow">
                    <div className="item-title ellipsis">{j?.customer || 'Job'}</div>
                    <div className="item-sub ellipsis">
                      <span className="mono">{j?.num}</span> · {dateShort(p.paid_at)}
                      {p.note ? ` · ${p.note}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <Pill c="var(--green)" bg="var(--green-tint)">
                      {PAY_METHOD_LABEL[p.method]}
                    </Pill>
                    <b className="num">{money(p.amount)}</b>
                  </div>
                </Link>
              )
            })}
          </>
        ) : (
          <>
            {rows.length === 0 && <Empty title={tab === 'Pending' ? 'All paid up' : 'No invoices sent yet'} />}
            {rows.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="item">
                <div className="avatar sq lg" style={j.pay_state === 'paid' ? { background: 'var(--green-tint)', color: 'var(--green)' } : undefined}>
                  <Icon name={j.pay_state === 'paid' ? 'check' : 'dollar'} />
                </div>
                <div className="grow">
                  <div className="item-title ellipsis">{j.customer}</div>
                  <div className="item-sub ellipsis">
                    <span className="mono">{j.num}</span> · {j.service || 'Job'}
                    {j.invoice_sent_at ? ` · invoiced ${dateShort(j.invoice_sent_at)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <StatusPill status={j.status} />
                  <b className="num">{money(j.pay_state === 'paid' ? j.price : due(j))}</b>
                  {j.pay_state !== 'paid' && Number(j.amount_paid) > 0 && (
                    <span className="faint" style={{ fontSize: 10.5, fontWeight: 600 }}>
                      of {money(j.price)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
