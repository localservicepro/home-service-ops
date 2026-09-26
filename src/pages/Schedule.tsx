import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { byId, loadStaff } from '../lib/data'
import { dateLong, isoDate, money } from '../lib/format'
import { must, supabase } from '../lib/supabase'
import type { Job } from '../lib/types'
import { Icon } from '../components/Icon'
import { JobRow } from '../components/job'
import { JobFormSheet } from '../components/JobForm'
import { Empty, LoadingPage } from '../components/ui'

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function SchedulePage() {
  const { bid, isOffice } = useBiz()
  const navigate = useNavigate()
  const today = isoDate()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [sel, setSel] = useState(today)
  const [creating, setCreating] = useState(false)

  // Grid: Monday-start weeks covering the month
  const lead = (month.getDay() + 6) % 7
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - lead)
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  const weeks = days[35].getMonth() !== month.getMonth() && days[28].getMonth() !== month.getMonth() ? 5 : 6
  const shown = days.slice(0, weeks * 7)
  const from = isoDate(shown[0])
  const to = isoDate(shown[shown.length - 1])

  const { data, loading, reload } = useLoad(async () => {
    const [jobs, staff] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .eq('business_id', bid)
        .gte('scheduled_date', from)
        .lte('scheduled_date', to)
        .neq('status', 'Cancelled')
        .order('scheduled_time', { ascending: true, nullsFirst: true })
        .then(must),
      loadStaff(bid),
    ])
    return { jobs: jobs as Job[], staff }
  }, [bid, from, to])

  const staffById = byId(data?.staff)
  const counts: Record<string, number> = {}
  for (const j of data?.jobs || []) counts[j.scheduled_date!] = (counts[j.scheduled_date!] || 0) + 1
  const dayJobs = (data?.jobs || []).filter((j) => j.scheduled_date === sel)
  const dayTotal = dayJobs.reduce((s, j) => s + Number(j.price), 0)

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section-label">Calendar</div>
          <h1>Schedule</h1>
        </div>
        {isOffice && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Book job
          </button>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="row-between" style={{ marginBottom: 14 }}>
            <button className="btn btn-ghost btn-icon" onClick={() => shift(-1)} aria-label="Previous month">
              <Icon name="back" />
            </button>
            <div className="center">
              <div style={{ fontWeight: 800, fontSize: 17 }}>{month.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</div>
              <button
                className="link-btn"
                onClick={() => {
                  const d = new Date()
                  setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                  setSel(today)
                }}
              >
                Today
              </button>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => shift(1)} aria-label="Next month">
              <Icon name="chevron" />
            </button>
          </div>
          <div className="cal">
            {DOW.map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}
            {shown.map((d) => {
              const iso = isoDate(d)
              const n = counts[iso] || 0
              return (
                <button
                  key={iso}
                  className={`cal-day ${d.getMonth() !== month.getMonth() ? 'out' : ''} ${iso === today ? 'today' : ''} ${iso === sel ? 'sel' : ''}`}
                  onClick={() => setSel(iso)}
                >
                  {d.getDate()}
                  {n > 0 ? <span className="cal-count">{n}</span> : <span style={{ height: 16 }} />}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div>
              <div className="section-label">{sel === today ? 'Today' : 'Selected day'}</div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{dateLong(sel)}</div>
            </div>
            {dayJobs.length > 0 && isOffice && (
              <span className="pill" style={{ color: 'var(--blue)', background: 'var(--blue-tint)' }}>
                {dayJobs.length} jobs · {money(dayTotal)}
              </span>
            )}
          </div>
          {loading ? (
            <LoadingPage />
          ) : (
            <div className="list">
              {dayJobs.length === 0 && (
                <Empty
                  title="Nothing booked"
                  action={
                    isOffice ? (
                      <button className="btn btn-soft btn-sm" onClick={() => setCreating(true)}>
                        + Book a job this day
                      </button>
                    ) : null
                  }
                />
              )}
              {dayJobs.map((j) => (
                <JobRow key={j.id} job={j} staff={j.staff_id ? staffById[j.staff_id] : null} />
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && (
        <JobFormSheet
          presetDate={sel}
          onClose={() => setCreating(false)}
          onSaved={(j) => {
            setCreating(false)
            reload()
            navigate(`/jobs/${j.id}`)
          }}
        />
      )}
    </div>
  )
}
