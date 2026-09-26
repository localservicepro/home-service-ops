import { Link, useNavigate } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { byId, loadJobs, loadStaff } from '../lib/data'
import { firstName, greeting, isoDate, moneyShort, parseISODate, relTime } from '../lib/format'
import { JOB_STATUS, PIPELINE, PIPE_LABEL } from '../lib/status'
import { must, supabase } from '../lib/supabase'
import type { Activity } from '../lib/types'
import { Icon } from '../components/Icon'
import { JobRow } from '../components/job'
import { Avatar, DutyPill, Empty, LoadingPage } from '../components/ui'

const ACT_ICON: Record<string, { icon: string; c: string; bg: string }> = {
  request: { icon: '✚', c: '#0C6FD0', bg: '#EAF3FC' },
  job_created: { icon: '✚', c: '#0C6FD0', bg: '#EAF3FC' },
  booked: { icon: '★', c: '#2C9E73', bg: '#E3F5EC' },
  status: { icon: '↻', c: '#5A7189', bg: '#EEF3F8' },
  invoice: { icon: '$', c: '#0C9BD6', bg: '#E2F6FD' },
  quote_sent: { icon: '➚', c: '#0C9BD6', bg: '#E2F6FD' },
  quote_viewed: { icon: '◉', c: '#0C9BD6', bg: '#E2F6FD' },
  quote_accepted: { icon: '✓', c: '#2C9E73', bg: '#E3F5EC' },
  quote_declined: { icon: '✕', c: '#C4453C', bg: '#FBEDEB' },
}

function weekRange(d = new Date()) {
  const day = (d.getDay() + 6) % 7 // Monday = 0
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return [isoDate(start), isoDate(end)]
}

export function DashboardPage() {
  const { bid, business, settings, user } = useBiz()
  const navigate = useNavigate()
  const { data, loading } = useLoad(async () => {
    const [jobs, staff, activity] = await Promise.all([
      loadJobs(bid),
      loadStaff(bid),
      supabase.from('activity').select('*').eq('business_id', bid).order('created_at', { ascending: false }).limit(12).then(must),
    ])
    return { jobs, staff, activity: activity as Activity[] }
  }, [bid])

  if (loading || !data) return <LoadingPage />
  const { jobs, staff, activity } = data
  const staffById = byId(staff)
  const today = isoDate()
  const [wkStart, wkEnd] = weekRange()
  const todays = jobs.filter((j) => j.scheduled_date === today && j.status !== 'Cancelled')
  const requests = jobs.filter((j) => j.status === 'New')
  const booked = jobs
    .filter((j) => j.scheduled_date && j.scheduled_date >= wkStart && j.scheduled_date <= wkEnd && j.status !== 'Cancelled')
    .reduce((s, j) => s + Number(j.price), 0)
  const activeStaff = staff.filter((s) => s.active)
  const onDuty = activeStaff.filter((s) => s.duty !== 'Off today').length
  const loadFor = (sid: string) => todays.filter((j) => j.staff_id === sid).length
  const name = firstName(settings?.owner_name || (user?.user_metadata?.full_name as string))

  return (
    <div className="page">
      <section className="hero">
        <div className="row-between rise" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="mono-label">{parseISODate(today).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
            <h1>
              {greeting()}
              {name ? `, ${name}` : ''}
            </h1>
            <div className="sub">{business.name}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="hero-btn" onClick={() => navigate('/quotes/new')} title="New quote">
              <Icon name="quote" />
            </button>
            <button className="hero-btn" onClick={() => navigate('/jobs?new=1')} title="New job">
              <Icon name="plus" />
            </button>
            <button className="hero-btn only-phone" onClick={() => navigate('/settings')} title="Settings">
              <Icon name="settings" />
            </button>
          </div>
        </div>
        <div className="stats">
          <div className="stat rise rise-1">
            <b>{todays.length}</b>
            <span>Jobs today</span>
          </div>
          <Link to="/jobs?filter=requests" className="stat live rise rise-2">
            <b>{requests.length}</b>
            <span>New requests →</span>
          </Link>
          <div className="stat rise rise-3">
            <b>{moneyShort(booked)}</b>
            <span>Booked this week</span>
          </div>
          <Link to="/crew" className="stat rise rise-4">
            <b>
              {onDuty}
              <span style={{ display: 'inline', fontSize: 15, color: 'var(--on-navy)' }}>/{activeStaff.length}</span>
            </b>
            <span>Crew on duty</span>
          </Link>
        </div>
      </section>

      <div className="section-label" style={{ marginBottom: 10 }}>
        Pipeline
      </div>
      <div className="row" style={{ gap: 7, marginBottom: 22 }}>
        {PIPELINE.map((s) => (
          <Link
            key={s}
            to={`/jobs?filter=all&status=${encodeURIComponent(s)}`}
            className="card grow center"
            style={{ padding: '10px 4px', borderRadius: 12, color: 'inherit' }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', margin: '0 auto 6px', background: JOB_STATUS[s].c }} />
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{jobs.filter((j) => j.status === s).length}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginTop: 4 }}>{PIPE_LABEL[s]}</div>
          </Link>
        ))}
      </div>

      <div className="grid-2 grid-2-wide">
        <div>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div className="section-label">Today’s schedule</div>
            <Link to="/schedule" style={{ fontSize: 12.5, fontWeight: 700 }}>
              Calendar
            </Link>
          </div>
          <div className="list">
            {todays.length === 0 && (
              <Empty title="Nothing booked today" action={<Link className="btn btn-soft btn-sm" to="/jobs?new=1">+ New job</Link>}>
                Enjoy the quiet — or fill it.
              </Empty>
            )}
            {todays.map((j) => (
              <JobRow key={j.id} job={j} staff={j.staff_id ? staffById[j.staff_id] : null} />
            ))}
          </div>

          <div className="section-label" style={{ margin: '22px 0 10px' }}>
            Crew status
          </div>
          <div className="seg" style={{ gap: 10 }}>
            {activeStaff.length === 0 && (
              <Empty title="No crew yet" action={<Link className="btn btn-soft btn-sm" to="/crew">Add crew</Link>} />
            )}
            {activeStaff.map((s) => (
              <Link key={s.id} to={`/crew/${s.id}`} className="card center" style={{ flex: 'none', width: 120, padding: '14px 10px', color: 'inherit' }}>
                <Avatar name={s.name} colour={s.colour} size="lg" />
                <div className="ellipsis" style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>
                  {firstName(s.name)}
                </div>
                <div className="muted" style={{ fontSize: 11, margin: '2px 0 8px' }}>
                  {loadFor(s.id)} today
                </div>
                <DutyPill duty={s.duty} />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>
            Recent activity
          </div>
          <div className="card" style={{ padding: '6px 14px' }}>
            {activity.length === 0 && <div className="muted" style={{ padding: '14px 0' }}>Activity shows up here as jobs move.</div>}
            {activity.map((a) => {
              const ic = ACT_ICON[a.kind] || ACT_ICON.status
              const inner = (
                <>
                  <span
                    style={{ width: 32, height: 32, borderRadius: 10, background: ic.bg, color: ic.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none' }}
                  >
                    {ic.icon}
                  </span>
                  <div className="grow">
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{a.message}</div>
                    <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
                      {relTime(a.created_at)}
                    </div>
                  </div>
                </>
              )
              const to = a.job_id ? `/jobs/${a.job_id}` : a.quote_id ? `/quotes/${a.quote_id}` : null
              return to ? (
                <Link key={a.id} to={to} className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)', color: 'inherit', alignItems: 'flex-start' }}>
                  {inner}
                </Link>
              ) : (
                <div key={a.id} className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)', alignItems: 'flex-start' }}>
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
