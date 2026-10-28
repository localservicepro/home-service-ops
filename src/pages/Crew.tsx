import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { loadStaff } from '../lib/data'
import { copy, inviteLink, sendEmail } from '../lib/api'
import { dateShort, firstName, hoursLabel, isoDate, money, relTime } from '../lib/format'
import { CREW_COLOURS, DUTY } from '../lib/status'
import { must, supabase } from '../lib/supabase'
import type { Duty, Invite, Job, Membership, RateType, Staff } from '../lib/types'
import { Icon } from '../components/Icon'
import { JobRow } from '../components/job'
import { Avatar, Confirm, DutyPill, Empty, Field, LoadingPage, MoneyInput, Sheet, Spinner, useAction, useToast } from '../components/ui'

const DUTIES: Duty[] = ['Available', 'On job', 'Off today']

export function crewPayFor(s: Staff, jobs: Job[]) {
  const done = jobs.filter((j) => j.staff_id === s.id && (j.status === 'Done' || j.status === 'Paid'))
  const ms = done.reduce((t, j) => t + Number(j.work_elapsed_ms || 0), 0)
  const earned = s.rate_type === 'hour' ? (Number(s.pay_rate) * ms) / 3_600_000 : Number(s.pay_rate) * done.length
  return { done: done.length, ms, earned }
}

export function CrewPage() {
  const { bid } = useBiz()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | Duty>('all')
  const today = isoDate()
  const { data, loading, reload } = useLoad(async () => {
    const [staff, jobs] = await Promise.all([
      loadStaff(bid),
      supabase.from('jobs').select('id,staff_id,status,scheduled_date').eq('business_id', bid).eq('scheduled_date', today).then(must),
    ])
    return { staff, jobs: jobs as Pick<Job, 'id' | 'staff_id' | 'status' | 'scheduled_date'>[] }
  }, [bid, today])
  if (loading || !data) return <LoadingPage />
  const list = data.staff.filter((s) => (filter === 'all' ? true : s.duty === filter))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section-label">{data.staff.filter((s) => s.duty !== 'Off today' && s.active).length} on duty</div>
          <h1>Crew</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add crew
        </button>
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        {(['all', ...DUTIES] as const).map((d) => (
          <button key={d} className={`chip ${filter === d ? 'on' : ''}`} onClick={() => setFilter(d)}>
            {d === 'all' ? 'Everyone' : d} <span className="count">{d === 'all' ? data.staff.length : data.staff.filter((s) => s.duty === d).length}</span>
          </button>
        ))}
      </div>
      <div className="grid-cards">
        {list.length === 0 && <Empty title="No crew here">Add the people who do the work so you can assign jobs.</Empty>}
        {list.map((s) => {
          const load = data.jobs.filter((j) => j.staff_id === s.id && j.status !== 'Cancelled').length
          return (
            <Link key={s.id} to={`/crew/${s.id}`} className="item" style={{ opacity: s.active ? 1 : 0.55 }}>
              <Avatar name={s.name} colour={s.colour} size="lg" />
              <div className="grow">
                <div className="item-title ellipsis">{s.name}</div>
                <div className="item-sub ellipsis">
                  {s.role} · {load} today · {money(s.pay_rate)}/{s.rate_type === 'hour' ? 'h' : 'job'}
                </div>
              </div>
              <DutyPill duty={s.duty} />
            </Link>
          )
        })}
      </div>
      {adding && (
        <StaffSheet
          count={data.staff.length}
          onClose={() => setAdding(false)}
          onSaved={(s) => {
            setAdding(false)
            reload()
            navigate(`/crew/${s.id}`)
          }}
        />
      )}
    </div>
  )
}

export function StaffSheet({ staff, count = 0, onClose, onSaved }: { staff?: Staff; count?: number; onClose: () => void; onSaved: (s: Staff) => void }) {
  const { bid } = useBiz()
  const { busy, run } = useAction()
  const [f, setF] = useState({
    name: staff?.name || '',
    phone: staff?.phone || '',
    email: staff?.email || '',
    role: staff?.role || 'Crew',
    colour: staff?.colour || CREW_COLOURS[count % CREW_COLOURS.length],
    pay_rate: Number(staff?.pay_rate) || 0,
    rate_type: (staff?.rate_type || 'hour') as RateType,
    active: staff?.active ?? true,
  })
  const save = () =>
    run(async () => {
      const row = { ...f, name: f.name.trim(), phone: f.phone || null, email: f.email || null }
      const saved = staff
        ? (must(await supabase.from('staff').update(row).eq('id', staff.id).select('*').single()) as Staff)
        : (must(await supabase.from('staff').insert({ ...row, business_id: bid }).select('*').single()) as Staff)
      onSaved(saved)
    }, staff ? 'Crew member updated' : 'Crew member added')
  return (
    <Sheet
      title={staff ? 'Edit crew member' : 'New crew member'}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-lg btn-block" disabled={!f.name.trim() || busy} onClick={save}>
          {busy ? <Spinner /> : 'Save'}
        </button>
      }
    >
      <div className="stack">
        <div className="form-grid cols-2">
          <Field label="Name">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Role / title">
            <input className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Crew lead, Cleaner…" />
          </Field>
          <Field label="Mobile">
            <input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Email (for login invite)">
            <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Pay rate">
            <MoneyInput value={f.pay_rate} onChange={(pay_rate) => setF({ ...f, pay_rate })} />
          </Field>
          <div className="field">
            <span>Paid per</span>
            <div className="tabs">
              {(['hour', 'job'] as const).map((r) => (
                <button key={r} className={f.rate_type === r ? 'on' : ''} onClick={() => setF({ ...f, rate_type: r })}>
                  {r === 'hour' ? 'Hour' : 'Job'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="field">
          <span>Colour</span>
          <div className="row wrap">
            {CREW_COLOURS.map((c) => (
              <button
                key={c}
                onClick={() => setF({ ...f, colour: c })}
                aria-label={`Colour ${c}`}
                style={{ width: 32, height: 32, borderRadius: '50%', border: f.colour === c ? '3px solid var(--ink)' : '3px solid #fff', background: c, cursor: 'pointer', boxShadow: '0 0 0 1px var(--line)' }}
              />
            ))}
          </div>
        </div>
        {staff && (
          <label className="check">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            Active (untick to hide from assignment)
          </label>
        )}
      </div>
    </Sheet>
  )
}

export function CrewDetailPage() {
  const { id = '' } = useParams()
  const { bid, user } = useBiz()
  const navigate = useNavigate()
  const toast = useToast()
  const { busy, run } = useAction()
  const [sheet, setSheet] = useState<null | 'edit' | 'invite' | 'delete'>(null)
  const { data, setData, loading, reload } = useLoad(async () => {
    const [staff, jobs, members, invites] = await Promise.all([
      supabase.from('staff').select('*').eq('id', id).single().then(must),
      supabase.from('jobs').select('*').eq('staff_id', id).order('scheduled_date', { ascending: false, nullsFirst: false }).then(must),
      supabase.from('memberships').select('*').eq('staff_id', id).then(must),
      supabase.from('invites').select('*').eq('staff_id', id).is('accepted_at', null).order('created_at', { ascending: false }).then(must),
    ])
    return { staff: staff as Staff, jobs: jobs as Job[], members: members as Membership[], invites: invites as Invite[] }
  }, [id])
  if (loading || !data) return <LoadingPage />
  const { staff, jobs } = data
  const today = isoDate()
  const monthStart = today.slice(0, 8) + '01'
  const monthJobs = jobs.filter((j) => j.scheduled_date && j.scheduled_date >= monthStart)
  const pay = crewPayFor(staff, monthJobs)
  const allPay = crewPayFor(staff, jobs)
  const upcoming = jobs.filter((j) => j.scheduled_date && j.scheduled_date >= today && !['Done', 'Paid', 'Cancelled'].includes(j.status)).reverse()
  const recent = jobs.filter((j) => !upcoming.includes(j)).slice(0, 12)
  const hasLogin = data.members.length > 0
  const pendingInvite = data.invites.find((i) => new Date(i.expires_at) > new Date())

  const setDuty = (duty: Duty) =>
    run(async () => {
      must(await supabase.from('staff').update({ duty }).eq('id', staff.id))
      setData({ ...data, staff: { ...staff, duty } })
    })

  const invite = (email: string) =>
    run(async () => {
      if (email !== staff.email) await supabase.from('staff').update({ email }).eq('id', staff.id)
      const inv = must(
        await supabase.from('invites').insert({ business_id: bid, email, role: 'crew', staff_id: staff.id, invited_by: user!.id }).select('*').single(),
      ) as Invite
      const r = await sendEmail('invite', inv.id, inviteLink(inv.token))
      toast(r.emailed ? `Invite sent to ${email}` : r.message)
      setSheet(null)
      reload()
    })

  return (
    <div className="page page-narrow">
      <section className="hero">
        <div className="row-between">
          <button className="hero-btn" onClick={() => navigate(-1)} aria-label="Back">
            <Icon name="back" />
          </button>
          <button className="hero-btn" onClick={() => setSheet('edit')} aria-label="Edit crew member">
            <Icon name="edit" />
          </button>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <Avatar name={staff.name} colour={staff.colour} size="xl" />
          <div className="grow">
            <h1 style={{ fontSize: 22 }}>{staff.name}</h1>
            <div className="sub">
              {staff.role} · {money(staff.pay_rate)}/{staff.rate_type === 'hour' ? 'hour' : 'job'}
            </div>
          </div>
        </div>
        <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat">
            <b>{pay.done}</b>
            <span>Jobs done this month</span>
          </div>
          <div className="stat">
            <b>{hoursLabel(pay.ms)}</b>
            <span>On site this month</span>
          </div>
          <div className="stat live">
            <b>{money(pay.earned)}</b>
            <span>Earned this month</span>
          </div>
        </div>
      </section>

      <div className="card">
        <div className="section-label" style={{ marginBottom: 10 }}>
          Duty today
        </div>
        <div className="tabs">
          {DUTIES.map((d) => (
            <button key={d} className={staff.duty === d ? 'on' : ''} onClick={() => setDuty(d)} disabled={busy} style={staff.duty === d ? { color: DUTY[d].c } : undefined}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row-between">
          <div>
            <div className="section-label">App login</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>
              {hasLogin ? 'Can log in to the field app' : pendingInvite ? `Invite pending · ${pendingInvite.email}` : 'No login yet'}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {hasLogin
                ? 'Sees only jobs assigned to them.'
                : pendingInvite
                  ? `Sent ${relTime(pendingInvite.sent_at || pendingInvite.created_at)} · expires ${dateShort(pendingInvite.expires_at)}`
                  : 'Invite them to see their jobs, run the timer and upload photos.'}
            </div>
          </div>
          {!hasLogin && (
            <div className="row" style={{ gap: 6 }}>
              {pendingInvite && (
                <button className="btn btn-ghost btn-sm" onClick={async () => (await copy(inviteLink(pendingInvite.token))) && toast('Invite link copied')}>
                  <Icon name="copy" />
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setSheet('invite')}>
                <Icon name="mail" /> {pendingInvite ? 'Resend' : 'Invite'}
              </button>
            </div>
          )}
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          {staff.phone && (
            <a className="btn btn-soft btn-sm" href={`tel:${staff.phone.replace(/\s/g, '')}`}>
              <Icon name="phone" /> Call {firstName(staff.name)}
            </a>
          )}
          {staff.phone && (
            <a className="btn btn-soft btn-sm" href={`sms:${staff.phone.replace(/\s/g, '')}`}>
              <Icon name="send" /> Text
            </a>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-label" style={{ marginBottom: 8 }}>
          Earnings (all time)
        </div>
        <div className="kv">
          <span>Completed jobs</span>
          <span>{allPay.done}</span>
        </div>
        <div className="kv">
          <span>Time on site</span>
          <span>{hoursLabel(allPay.ms)}</span>
        </div>
        <div className="kv">
          <span>Crew pay</span>
          <span>{money(allPay.earned)}</span>
        </div>
      </div>

      <div className="section-label" style={{ margin: '20px 0 10px' }}>
        Upcoming
      </div>
      <div className="list">
        {upcoming.length === 0 && <Empty title="Nothing assigned" />}
        {upcoming.map((j) => (
          <JobRow key={j.id} job={j} staff={staff} showDate />
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="section-label" style={{ margin: '20px 0 10px' }}>
            Recent
          </div>
          <div className="list">
            {recent.map((j) => (
              <JobRow key={j.id} job={j} staff={staff} showDate />
            ))}
          </div>
        </>
      )}

      <button className="btn btn-danger btn-sm" style={{ marginTop: 24 }} onClick={() => setSheet('delete')}>
        <Icon name="trash" /> Remove crew member
      </button>

      {sheet === 'edit' && (
        <StaffSheet
          staff={staff}
          onClose={() => setSheet(null)}
          onSaved={(s) => {
            setData({ ...data, staff: s })
            setSheet(null)
          }}
        />
      )}
      {sheet === 'invite' && <InviteSheet defaultEmail={staff.email || ''} name={staff.name} busy={busy} onClose={() => setSheet(null)} onSend={invite} />}
      {sheet === 'delete' && (
        <Confirm
          title={`Remove ${staff.name}?`}
          body="Their jobs will become unassigned and any login they have stops seeing this business’s jobs."
          danger
          confirmLabel="Remove"
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            await supabase.from('memberships').delete().eq('staff_id', staff.id).eq('role', 'crew')
            must(await supabase.from('staff').delete().eq('id', staff.id))
            navigate('/crew', { replace: true })
          }}
        />
      )}
    </div>
  )
}

function InviteSheet({ defaultEmail, name, busy, onClose, onSend }: { defaultEmail: string; name: string; busy: boolean; onClose: () => void; onSend: (email: string) => void }) {
  const [email, setEmail] = useState(defaultEmail)
  return (
    <Sheet
      title="Invite to log in"
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-lg btn-block" disabled={!/.+@.+\..+/.test(email) || busy} onClick={() => onSend(email.trim())}>
          {busy ? <Spinner /> : 'Send invite'}
        </button>
      }
    >
      <div className="stack">
        <p className="muted">
          {firstName(name)} will get an email with a link to create a password. They’ll only see jobs assigned to them.
        </p>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
      </div>
    </Sheet>
  )
}
