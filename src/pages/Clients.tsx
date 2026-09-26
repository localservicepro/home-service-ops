import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { byId, loadClients, loadStaff } from '../lib/data'
import { dateShort, initials, money } from '../lib/format'
import { must, supabase } from '../lib/supabase'
import type { Address, Client, Job, Quote } from '../lib/types'
import { Icon } from '../components/Icon'
import { JobRow } from '../components/job'
import { JobFormSheet } from '../components/JobForm'
import { Confirm, Empty, Field, LoadingPage, QuotePill, Sheet, Spinner, useAction } from '../components/ui'

export function ClientsPage() {
  const { bid } = useBiz()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const { data, loading, reload } = useLoad(async () => {
    const [clients, jobs] = await Promise.all([
      loadClients(bid),
      supabase.from('jobs').select('client_id,price,pay_state,status').eq('business_id', bid).then(must),
    ])
    return { clients, jobs: jobs as Pick<Job, 'client_id' | 'price' | 'pay_state' | 'status'>[] }
  }, [bid])
  if (loading || !data) return <LoadingPage />

  const stats = (id: string) => {
    const js = data.jobs.filter((j) => j.client_id === id && j.status !== 'Cancelled')
    return {
      jobs: js.length,
      spend: js.filter((j) => j.pay_state === 'paid').reduce((s, j) => s + Number(j.price), 0),
      owing: js.filter((j) => j.pay_state !== 'paid' && j.status === 'Done').reduce((s, j) => s + Number(j.price), 0),
    }
  }
  const needle = q.trim().toLowerCase()
  const list = data.clients.filter(
    (c) => !needle || [c.name, c.phone, c.email, ...c.addresses.map((a) => a.line)].some((f) => (f || '').toLowerCase().includes(needle)),
  )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section-label">{data.clients.length} customers</div>
          <h1>Clients</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add client
        </button>
      </div>
      <div className="input-prefix" style={{ marginBottom: 14 }}>
        <b>
          <Icon name="search" size={16} />
        </b>
        <input className="input" style={{ paddingLeft: 38 }} placeholder="Search name, phone, address" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid-cards">
        {list.length === 0 && <Empty title={needle ? 'No matches' : 'No clients yet'}>Clients are created automatically when you add jobs or quotes.</Empty>}
        {list.map((c) => {
          const s = stats(c.id)
          return (
            <Link key={c.id} to={`/clients/${c.id}`} className="item" style={{ alignItems: 'flex-start' }}>
              <span className="avatar sq lg">{initials(c.name)}</span>
              <div className="grow">
                <div className="item-title ellipsis">{c.name}</div>
                <div className="item-sub ellipsis">{c.addresses[0]?.line || c.phone || c.email || 'No details'}</div>
                <div className="row" style={{ gap: 12, marginTop: 8, fontSize: 11.5, fontWeight: 700 }}>
                  <span className="muted">{s.jobs} jobs</span>
                  <span style={{ color: 'var(--green)' }}>{money(s.spend)}</span>
                  {s.owing > 0 && <span style={{ color: 'var(--amber)' }}>{money(s.owing)} owing</span>}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      {adding && (
        <ClientSheet
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false)
            reload()
            navigate(`/clients/${c.id}`)
          }}
        />
      )}
    </div>
  )
}

export function ClientSheet({ client, onClose, onSaved }: { client?: Client; onClose: () => void; onSaved: (c: Client) => void }) {
  const { bid } = useBiz()
  const { busy, run } = useAction()
  const [name, setName] = useState(client?.name || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [email, setEmail] = useState(client?.email || '')
  const [notes, setNotes] = useState(client?.notes || '')
  const [addresses, setAddresses] = useState<Address[]>(client?.addresses.length ? client.addresses : [{ label: 'Home', line: '' }])
  const save = () =>
    run(async () => {
      const row = { name: name.trim(), phone: phone || null, email: email || null, notes: notes || null, addresses: addresses.filter((a) => a.line.trim()) }
      const saved = client
        ? (must(await supabase.from('clients').update(row).eq('id', client.id).select('*').single()) as Client)
        : (must(await supabase.from('clients').insert({ ...row, business_id: bid }).select('*').single()) as Client)
      onSaved(saved)
    }, client ? 'Client updated' : 'Client added')
  return (
    <Sheet
      title={client ? 'Edit client' : 'New client'}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block btn-lg" disabled={!name.trim() || busy} onClick={save}>
          {busy ? <Spinner /> : 'Save client'}
        </button>
      }
    >
      <div className="stack">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="form-grid cols-2">
          <Field label="Phone">
            <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="section-label">Properties</div>
        {addresses.map((a, i) => (
          <div key={i} className="row">
            <input
              className="input"
              style={{ width: 110 }}
              placeholder="Label"
              value={a.label || ''}
              onChange={(e) => setAddresses(addresses.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <input
              className="input grow"
              placeholder="Street, suburb, state, postcode"
              value={a.line}
              onChange={(e) => setAddresses(addresses.map((x, j) => (j === i ? { ...x, line: e.target.value } : x)))}
            />
            <button className="line-x" onClick={() => setAddresses(addresses.filter((_, j) => j !== i))} aria-label="Remove address">
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAddresses([...addresses, { label: '', line: '' }])}>
          <Icon name="plus" /> Add property
        </button>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access, pets, preferences…" />
        </Field>
      </div>
    </Sheet>
  )
}

export function ClientDetailPage() {
  const { id = '' } = useParams()
  const { bid } = useBiz()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<null | 'edit' | 'job' | 'delete'>(null)
  const { data, setData, loading, reload } = useLoad(async () => {
    const [client, jobs, quotes, staff] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single().then(must),
      supabase.from('jobs').select('*').eq('client_id', id).order('scheduled_date', { ascending: false, nullsFirst: true }).then(must),
      supabase.from('quotes').select('*').eq('client_id', id).order('created_at', { ascending: false }).then(must),
      loadStaff(bid),
    ])
    return { client: client as Client, jobs: jobs as Job[], quotes: quotes as Quote[], staff }
  }, [id, bid])
  if (loading || !data) return <LoadingPage />
  const { client, jobs, quotes } = data
  const staffById = byId(data.staff)
  const live = jobs.filter((j) => j.status !== 'Cancelled')
  const spend = live.filter((j) => j.pay_state === 'paid').reduce((s, j) => s + Number(j.price), 0)
  const owing = live.filter((j) => j.pay_state !== 'paid' && j.status === 'Done').reduce((s, j) => s + Number(j.price), 0)
  const lastPaid = live.filter((j) => j.paid_at).sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''))[0]

  return (
    <div className="page page-narrow">
      <section className="hero">
        <div className="row-between">
          <button className="hero-btn" onClick={() => navigate(-1)} aria-label="Back">
            <Icon name="back" />
          </button>
          <button className="hero-btn" onClick={() => setSheet('edit')} aria-label="Edit client">
            <Icon name="edit" />
          </button>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <span className="avatar sq xl" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}>
            {initials(client.name)}
          </span>
          <div className="grow">
            <h1 style={{ fontSize: 22 }}>{client.name}</h1>
            <div className="sub">
              {client.phone || 'No phone'}
              {client.email ? ` · ${client.email}` : ''}
            </div>
          </div>
        </div>
        <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat">
            <b>{live.length}</b>
            <span>Jobs</span>
          </div>
          <div className="stat live">
            <b>{money(spend)}</b>
            <span>Lifetime spend</span>
          </div>
          <div className="stat">
            <b style={owing ? { color: '#FFC46B' } : undefined}>{money(owing)}</b>
            <span>Owing</span>
          </div>
        </div>
      </section>

      <div className="row wrap" style={{ marginBottom: 14 }}>
        {client.phone && (
          <a className="btn btn-soft" href={`tel:${client.phone.replace(/\s/g, '')}`}>
            <Icon name="phone" /> Call
          </a>
        )}
        {client.email && (
          <a className="btn btn-soft" href={`mailto:${client.email}`}>
            <Icon name="mail" /> Email
          </a>
        )}
        <Link className="btn btn-ghost" to={`/quotes/new?client=${client.id}`}>
          <Icon name="quote" /> Quote
        </Link>
        <button className="btn btn-primary" onClick={() => setSheet('job')}>
          <Icon name="plus" /> New job
        </button>
      </div>

      <div className="card">
        <div className="section-label" style={{ marginBottom: 8 }}>
          Properties
        </div>
        {client.addresses.length === 0 && <div className="muted">No addresses saved.</div>}
        {client.addresses.map((a) => (
          <div key={a.line} className="kv">
            <span>{a.label || 'Property'}</span>
            <span>{a.line}</span>
          </div>
        ))}
        {client.notes && <p style={{ marginTop: 10, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{client.notes}</p>}
        {lastPaid && (
          <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>
            Last paid {dateShort(lastPaid.paid_at)} · {money(lastPaid.price)}
          </div>
        )}
      </div>

      <div className="section-label" style={{ margin: '20px 0 10px' }}>
        Job history
      </div>
      <div className="list">
        {jobs.length === 0 && <Empty title="No jobs yet" />}
        {jobs.map((j) => (
          <JobRow key={j.id} job={j} staff={j.staff_id ? staffById[j.staff_id] : null} showDate />
        ))}
      </div>

      {quotes.length > 0 && (
        <>
          <div className="section-label" style={{ margin: '20px 0 10px' }}>
            Quotes
          </div>
          <div className="list">
            {quotes.map((q) => (
              <Link key={q.id} to={`/quotes/${q.id}`} className="item">
                <div className="grow">
                  <div className="item-title">
                    <span className="mono">{q.num}</span>
                  </div>
                  <div className="item-sub">{dateShort(q.created_at)}</div>
                </div>
                <QuotePill status={q.status} />
                <b className="num">{money(q.price)}</b>
              </Link>
            ))}
          </div>
        </>
      )}

      <button className="btn btn-danger btn-sm" style={{ marginTop: 24 }} onClick={() => setSheet('delete')}>
        <Icon name="trash" /> Delete client
      </button>

      {sheet === 'edit' && (
        <ClientSheet
          client={client}
          onClose={() => setSheet(null)}
          onSaved={(c) => {
            setData({ ...data, client: c })
            setSheet(null)
          }}
        />
      )}
      {sheet === 'job' && (
        <JobFormSheet
          presetClient={client}
          onClose={() => setSheet(null)}
          onSaved={(j) => {
            reload()
            navigate(`/jobs/${j.id}`)
          }}
        />
      )}
      {sheet === 'delete' && (
        <Confirm
          title="Delete client?"
          body="Their jobs and quotes stay, but will no longer be linked to a client record."
          danger
          confirmLabel="Delete"
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            must(await supabase.from('clients').delete().eq('id', client.id))
            navigate('/clients', { replace: true })
          }}
        />
      )}
    </div>
  )
}
