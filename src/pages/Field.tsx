import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { firstName, greeting, hoursLabel, isoDate, money } from '../lib/format'
import { DUTY } from '../lib/status'
import { must, supabase } from '../lib/supabase'
import type { Duty, Job, Staff } from '../lib/types'
import { BusinessSwitcher } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { JobRow } from '../components/job'
import { Avatar, Empty, LoadingPage, useAction } from '../components/ui'
import { crewPayFor } from './Crew'

const DUTIES: Duty[] = ['Available', 'On job', 'Off today']

function useMyCrew() {
  const { bid, membership } = useBiz()
  return useLoad(async () => {
    const sid = membership.staff_id
    const [staff, jobs] = await Promise.all([
      sid ? supabase.from('staff').select('*').eq('id', sid).maybeSingle().then(must) : Promise.resolve(null),
      sid
        ? supabase
            .from('jobs')
            .select('*')
            .eq('business_id', bid)
            .eq('staff_id', sid)
            .order('scheduled_date', { ascending: true, nullsFirst: false })
            .order('scheduled_time', { ascending: true, nullsFirst: true })
            .then(must)
        : Promise.resolve([]),
    ])
    return { staff: staff as Staff | null, jobs: jobs as Job[] }
  }, [bid, membership.staff_id])
}

function NoProfile() {
  return (
    <div className="page page-narrow">
      <Empty title="No crew profile linked">Ask the office to link your login to your crew record, then pull to refresh.</Empty>
    </div>
  )
}

export function FieldPage() {
  const { business } = useBiz()
  const { data, setData, loading } = useMyCrew()
  const { busy, run } = useAction()
  if (loading || !data) return <LoadingPage />
  if (!data.staff) return <NoProfile />
  const { staff, jobs } = data
  const today = isoDate()
  const live = jobs.filter((j) => j.status !== 'Cancelled')
  const todays = live.filter((j) => j.scheduled_date === today)
  const running = live.find((j) => j.work_state === 'running')
  const upcoming = live.filter((j) => j.scheduled_date && j.scheduled_date > today && !['Done', 'Paid'].includes(j.status))
  const overdue = live.filter((j) => j.scheduled_date && j.scheduled_date < today && ['Job Scheduled', 'In Progress'].includes(j.status))
  const doneToday = todays.filter((j) => j.status === 'Done' || j.status === 'Paid').length

  const setDuty = (d: Duty) =>
    run(async () => {
      const { error } = await supabase.rpc('set_my_duty', { bid: staff.business_id, d })
      if (error) throw new Error(error.message)
      setData({ ...data, staff: { ...staff, duty: d } })
    })

  return (
    <div className="page page-narrow">
      <section className="hero">
        <div className="mono-label">{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
        <h1>
          {greeting()}, {firstName(staff.name)}
        </h1>
        <div className="sub">{business.name}</div>
        <div className="stats">
          <div className="stat live">
            <b>{todays.length}</b>
            <span>Jobs today</span>
          </div>
          <div className="stat">
            <b>
              {doneToday}/{todays.length}
            </b>
            <span>Done</span>
          </div>
        </div>
        <div className="tabs" style={{ marginTop: 14, background: 'rgba(255,255,255,.08)' }}>
          {DUTIES.map((d) => (
            <button
              key={d}
              className={staff.duty === d ? 'on' : ''}
              style={staff.duty === d ? { color: DUTY[d].c } : { color: 'var(--on-navy)' }}
              onClick={() => setDuty(d)}
              disabled={busy}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      {running && (
        <div className="note" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="live-dot" /> Timer running on <b>{running.service}</b> for {running.customer}.
          <Link to={`/jobs/${running.id}`} style={{ marginLeft: 'auto', fontWeight: 700 }}>
            Open →
          </Link>
        </div>
      )}

      <div className="section-label" style={{ marginBottom: 10 }}>
        Today
      </div>
      <div className="list">
        {todays.length === 0 && <Empty title="No jobs today">Check upcoming below, or ask the office.</Empty>}
        {todays.map((j) => (
          <JobRow key={j.id} job={j} staff={staff} />
        ))}
      </div>

      {overdue.length > 0 && (
        <>
          <div className="section-label" style={{ margin: '20px 0 10px', color: 'var(--amber)' }}>
            Still open from earlier
          </div>
          <div className="list">
            {overdue.map((j) => (
              <JobRow key={j.id} job={j} staff={staff} showDate />
            ))}
          </div>
        </>
      )}

      <div className="section-label" style={{ margin: '20px 0 10px' }}>
        Upcoming
      </div>
      <div className="list">
        {upcoming.length === 0 && <div className="muted">Nothing else scheduled yet.</div>}
        {upcoming.slice(0, 20).map((j) => (
          <JobRow key={j.id} job={j} staff={staff} showDate />
        ))}
      </div>
    </div>
  )
}

export function FieldProfilePage() {
  const { user, business, memberships, switchBusiness, signOut } = useBiz()
  const { data, loading } = useMyCrew()
  const [switcher, setSwitcher] = useState(false)
  if (loading || !data) return <LoadingPage />
  if (!data.staff) return <NoProfile />
  const { staff, jobs } = data
  const monthStart = isoDate().slice(0, 8) + '01'
  const month = crewPayFor(
    staff,
    jobs.filter((j) => j.scheduled_date && j.scheduled_date >= monthStart),
  )
  const all = crewPayFor(staff, jobs)

  return (
    <div className="page page-narrow">
      <section className="hero center">
        <Avatar name={staff.name} colour={staff.colour} size="xl" />
        <h1 style={{ marginTop: 10 }}>{staff.name}</h1>
        <div className="sub">
          {staff.role} · {business.name}
        </div>
        <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat">
            <b>{month.done}</b>
            <span>Jobs this month</span>
          </div>
          <div className="stat">
            <b>{hoursLabel(month.ms)}</b>
            <span>On site</span>
          </div>
          <div className="stat live">
            <b>{money(month.earned)}</b>
            <span>Earned</span>
          </div>
        </div>
      </section>

      <div className="card">
        <div className="kv">
          <span>Email</span>
          <span>{user?.email}</span>
        </div>
        <div className="kv">
          <span>Mobile</span>
          <span>{staff.phone || '—'}</span>
        </div>
        <div className="kv">
          <span>Pay rate</span>
          <span>
            {money(staff.pay_rate)} / {staff.rate_type === 'hour' ? 'hour' : 'job'}
          </span>
        </div>
        <div className="kv">
          <span>All-time jobs</span>
          <span>{all.done}</span>
        </div>
        <div className="kv">
          <span>All-time earnings</span>
          <span>{money(all.earned)}</span>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {memberships.length > 1 && (
          <button className="btn btn-ghost" onClick={() => setSwitcher(true)}>
            <Icon name="swap" /> Switch business
          </button>
        )}
        <button className="btn btn-danger" onClick={signOut}>
          <Icon name="logout" /> Sign out
        </button>
      </div>

      {switcher && (
        <BusinessSwitcher
          onClose={() => setSwitcher(false)}
          onPick={(id) => {
            switchBusiness(id)
            setSwitcher(false)
          }}
        />
      )}
    </div>
  )
}
