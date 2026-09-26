import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { loadJobs, loadQuotes } from '../lib/data'
import { dateShort, money, moneyShort } from '../lib/format'
import { PAY_METHOD_LABEL } from '../lib/status'
import { Icon } from '../components/Icon'
import { Empty, LoadingPage, Pill, QuotePill, StatusPill } from '../components/ui'

const TABS = ['Transactions', 'Invoices', 'Pending', 'Quotes'] as const
type Tab = (typeof TABS)[number]

export function PaymentsPage() {
  const { bid } = useBiz()
  const [tab, setTab] = useState<Tab>('Transactions')
  const { data, loading } = useLoad(async () => {
    const [jobs, quotes] = await Promise.all([loadJobs(bid), loadQuotes(bid)])
    return { jobs, quotes }
  }, [bid])
  if (loading || !data) return <LoadingPage />

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const paid = data.jobs.filter((j) => j.pay_state === 'paid').sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''))
  const collectedMonth = paid.filter((j) => j.paid_at && new Date(j.paid_at) >= monthStart).reduce((s, j) => s + Number(j.price), 0)
  const pending = data.jobs.filter((j) => j.pay_state !== 'paid' && (j.status === 'Done' || j.invoice_sent_at) && j.status !== 'Cancelled')
  const outstanding = pending.reduce((s, j) => s + Number(j.price), 0)
  const invoices = data.jobs.filter((j) => j.invoice_sent_at).sort((a, b) => (b.invoice_sent_at || '').localeCompare(a.invoice_sent_at || ''))
  const openQuotes = data.quotes.filter((q) => q.status === 'Awaiting')
  const quoted = openQuotes.reduce((s, q) => s + Number(q.price), 0)
  const byMethod = (['cash', 'bank', 'online'] as const).map((m) => ({
    m,
    total: paid.filter((j) => j.pay_method === m && j.paid_at && new Date(j.paid_at) >= monthStart).reduce((s, j) => s + Number(j.price), 0),
  }))

  const rows = tab === 'Transactions' ? paid : tab === 'Invoices' ? invoices : tab === 'Pending' ? pending : []

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
        ) : (
          <>
            {rows.length === 0 && (
              <Empty title={tab === 'Pending' ? 'All paid up' : tab === 'Invoices' ? 'No invoices sent yet' : 'No payments yet'}>
                {tab === 'Transactions' ? 'Payments you record on jobs show up here.' : null}
              </Empty>
            )}
            {rows.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="item">
                <div
                  className="avatar sq lg"
                  style={j.pay_state === 'paid' ? { background: 'var(--green-tint)', color: 'var(--green)' } : undefined}
                >
                  <Icon name={j.pay_state === 'paid' ? 'check' : 'dollar'} />
                </div>
                <div className="grow">
                  <div className="item-title ellipsis">{j.customer}</div>
                  <div className="item-sub ellipsis">
                    <span className="mono">{j.num}</span> · {j.service || 'Job'}
                    {tab === 'Transactions' && j.paid_at ? ` · ${dateShort(j.paid_at)}` : ''}
                    {tab !== 'Transactions' && j.invoice_sent_at ? ` · invoiced ${dateShort(j.invoice_sent_at)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {tab === 'Transactions' && j.pay_method ? (
                    <Pill c="var(--green)" bg="var(--green-tint)">
                      {PAY_METHOD_LABEL[j.pay_method]}
                    </Pill>
                  ) : (
                    <StatusPill status={j.status} />
                  )}
                  <b className="num">{money(j.price)}</b>
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
