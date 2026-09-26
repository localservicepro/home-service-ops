import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { byId, loadJobs, loadQuotes, loadStaff } from '../lib/data'
import { dateShort, money } from '../lib/format'
import { ACTIVE } from '../lib/status'
import type { JobStatus } from '../lib/types'
import { Icon } from '../components/Icon'
import { JobRow } from '../components/job'
import { JobFormSheet } from '../components/JobForm'
import { Empty, LoadingPage, QuotePill } from '../components/ui'

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'requests', label: 'Requests' },
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']

export function JobsPage() {
  const { bid } = useBiz()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filter') as FilterKey) || 'active'
  const statusFilter = params.get('status') as JobStatus | null
  const [q, setQ] = useState('')
  const showNew = params.get('new') === '1'

  const { data, loading, reload } = useLoad(async () => {
    const [jobs, staff, quotes] = await Promise.all([loadJobs(bid), loadStaff(bid), loadQuotes(bid)])
    return { jobs, staff, quotes }
  }, [bid])

  const staffById = useMemo(() => byId(data?.staff), [data])
  const needle = q.trim().toLowerCase()
  const match = (...fields: (string | null | undefined)[]) => !needle || fields.some((f) => (f || '').toLowerCase().includes(needle))

  if (loading || !data) return <LoadingPage />

  const inFilter = (s: JobStatus) =>
    filter === 'active' ? ACTIVE.includes(s) : filter === 'requests' ? s === 'New' : filter === 'completed' ? s === 'Done' || s === 'Paid' : true
  const jobs = data.jobs.filter((j) => inFilter(j.status) && (!statusFilter || j.status === statusFilter) && match(j.customer, j.address, j.service, j.num, j.phone))
  const quotes = data.quotes.filter((x) => match(x.customer, x.address, x.num))
  const counts: Record<FilterKey, number> = {
    active: data.jobs.filter((j) => ACTIVE.includes(j.status)).length,
    quotes: data.quotes.filter((x) => x.status === 'Awaiting').length,
    requests: data.jobs.filter((j) => j.status === 'New').length,
    all: data.jobs.length,
    completed: data.jobs.filter((j) => j.status === 'Done' || j.status === 'Paid').length,
  }

  const setFilter = (f: FilterKey) => setParams({ filter: f })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section-label">Work</div>
          <h1>Jobs</h1>
        </div>
        <div className="row">
          <Link to="/quotes/new" className="btn btn-ghost">
            <Icon name="quote" /> <span className="hide-phone">New </span>quote
          </Link>
          <button className="btn btn-primary" onClick={() => setParams({ filter, new: '1' })}>
            <Icon name="plus" /> New job
          </button>
        </div>
      </div>

      <div className="input-prefix" style={{ marginBottom: 12 }}>
        <b>
          <Icon name="search" size={16} />
        </b>
        <input className="input" style={{ paddingLeft: 38 }} placeholder="Search customer, address, job #" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="seg" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} <span className="count">{counts[f.key]}</span>
          </button>
        ))}
        {statusFilter && (
          <button className="chip soft on" onClick={() => setParams({ filter })}>
            {statusFilter} ✕
          </button>
        )}
      </div>

      {filter === 'quotes' ? (
        <div className="list">
          {quotes.length === 0 && <Empty title="No quotes yet" action={<Link to="/quotes/new" className="btn btn-soft btn-sm">Build a quote</Link>} />}
          {quotes.map((x) => (
            <Link key={x.id} to={`/quotes/${x.id}`} className="item">
              <div className="avatar sq lg">
                <Icon name="quote" />
              </div>
              <div className="grow">
                <div className="item-title ellipsis">{x.customer || 'No customer'}</div>
                <div className="item-sub ellipsis">
                  <span className="mono">{x.num}</span> · {x.sent_at ? `Sent ${dateShort(x.sent_at)}` : 'Draft'}
                  {x.viewed_at ? ' · Viewed' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <QuotePill status={x.status} />
                <span className="num" style={{ fontWeight: 800 }}>{money(x.price)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="list">
          {jobs.length === 0 && (
            <Empty title={needle ? 'No matches' : filter === 'requests' ? 'No new requests' : 'No jobs here yet'}>
              {filter === 'requests' ? 'Requests land here when customers accept quotes or you log an enquiry.' : null}
            </Empty>
          )}
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} staff={j.staff_id ? staffById[j.staff_id] : null} showDate />
          ))}
        </div>
      )}

      {showNew && (
        <JobFormSheet
          onClose={() => setParams({ filter })}
          onSaved={(j) => {
            reload()
            navigate(`/jobs/${j.id}`)
          }}
        />
      )}
    </div>
  )
}
