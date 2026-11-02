import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { clock, dateShort, money, timeParts } from '../lib/format'
import { JOB_STATUS, PIPELINE, PIPE_LABEL } from '../lib/status'
import { computeTotals, lineTotal } from '../lib/totals'
import type { Job, JobStatus, LineItem, Staff } from '../lib/types'
import { useTick } from '../hooks/useLoad'
import { useAuth } from '../context/AuthContext'
import { Avatar, StatusPill } from './ui'
import { Icon } from './Icon'

export function JobRow({ job, staff, to, showDate }: { job: Job; staff?: Staff | null; to?: string; showDate?: boolean }) {
  const t = timeParts(job.scheduled_time)
  const { isOffice } = useAuth()
  return (
    <Link to={to || `/jobs/${job.id}`} className="item">
      <div className="item-time">
        {showDate && job.scheduled_date ? (
          <>
            <b>{dateShort(job.scheduled_date).split(' ').slice(1).join(' ')}</b>
            <small>{t.ampm ? `${t.time}${t.ampm}` : dateShort(job.scheduled_date).split(' ')[0]}</small>
          </>
        ) : (
          <>
            <b>{t.time}</b>
            <small>{t.ampm || (job.scheduled_date ? 'any' : 'tbc')}</small>
          </>
        )}
      </div>
      <div className="vrule" />
      <div className="grow">
        <div className="item-title ellipsis">{job.service || 'Untitled job'}</div>
        <div className="item-sub ellipsis">
          {job.customer || 'No customer'}
          {job.address ? ` · ${job.address}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <StatusPill status={job.status} />
        <div className="row" style={{ gap: 6 }}>
          {isOffice && job.price > 0 && <span className="num" style={{ fontSize: 12, fontWeight: 700 }}>{money(job.price)}</span>}
          <Avatar name={staff?.name} colour={staff?.colour} />
        </div>
      </div>
    </Link>
  )
}

export function StatusPipeline({ status, onPick }: { status: JobStatus; onPick?: (s: JobStatus) => void }) {
  const idx = PIPELINE.indexOf(status)
  if (status === 'Cancelled') {
    return (
      <div className="row" style={{ color: JOB_STATUS.Cancelled.c, fontWeight: 700 }}>
        <Icon name="x" /> This job was cancelled
      </div>
    )
  }
  return (
    <div className="pipeline">
      {PIPELINE.map((s, i) => (
        <div
          key={s}
          className={`pipe-step ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''} ${onPick ? 'clickable' : ''}`}
          onClick={() => onPick?.(s)}
          role={onPick ? 'button' : undefined}
          title={onPick ? `Move to ${s}` : undefined}
        >
          <div className="pipe-dot" style={i === idx ? { background: JOB_STATUS[s].c, borderColor: JOB_STATUS[s].c } : undefined}>
            {i < idx ? '✓' : ''}
          </div>
          <span>{PIPE_LABEL[s]}</span>
        </div>
      ))}
    </div>
  )
}

export function elapsedMs(job: Pick<Job, 'work_state' | 'work_started_at' | 'work_elapsed_ms'>) {
  const base = Number(job.work_elapsed_ms) || 0
  if (job.work_state === 'running' && job.work_started_at) return base + (Date.now() - new Date(job.work_started_at).getTime())
  return base
}

export function WorkTimer({
  job,
  onStart,
  onFinish,
  onResume,
  busy,
}: {
  job: Job
  onStart: () => void
  onFinish: () => void
  onResume?: () => void
  busy?: boolean
}) {
  const running = job.work_state === 'running'
  useTick(running)
  return (
    <div className="card-dark">
      <div className="row-between">
        <span className="section-label" style={{ color: 'var(--on-navy)' }}>
          On-site time
        </span>
        {running && (
          <span className="row" style={{ gap: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--cyan)' }}>
            <span className="live-dot" /> TRACKING
          </span>
        )}
      </div>
      <div className="timer num">{clock(elapsedMs(job))}</div>
      {job.work_state === 'idle' && (
        <button className="btn btn-primary btn-lg btn-block" onClick={onStart} disabled={busy}>
          <Icon name="play" /> Start job
        </button>
      )}
      {running && (
        <button className="btn btn-white btn-lg btn-block" onClick={onFinish} disabled={busy}>
          <Icon name="stop" /> Finish job
        </button>
      )}
      {job.work_state === 'done' && (
        <div className="row" style={{ justifyContent: 'center', color: 'var(--cyan)', fontWeight: 700, fontSize: 13 }}>
          <Icon name="check" /> Work complete
          {onResume && (
            <button className="link-btn" style={{ color: 'var(--on-navy)', marginLeft: 8 }} onClick={onResume}>
              Resume timer
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Invoice / quote lines with subtotal, discount, GST and total. */
export function InvoiceLines({
  items,
  discount,
  gst,
  onRemove,
  caption = 'Total',
  footer,
}: {
  items: LineItem[]
  discount: number
  gst: boolean
  onRemove?: (id: string) => void
  caption?: string
  footer?: ReactNode
}) {
  const t = computeTotals(items, discount, gst)
  return (
    <div>
      <div className="lines-head">
        <span className="grow">DESCRIPTION</span>
        <span>AMOUNT</span>
      </div>
      {items.length === 0 && <div className="muted" style={{ padding: '14px 0', fontSize: 13 }}>No line items yet.</div>}
      {items.map((l) => (
        <div key={l.id} className={`line ${l.kind === 'addon' ? 'addon' : ''}`}>
          <div className="grow">
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="line-name">
                {l.kind === 'addon' ? '↳ ' : ''}
                {l.name}
              </span>
              {l.kind === 'extra' && <span className="tag">Extra</span>}
            </div>
            <div className="line-qty">
              {l.qty} × {money(l.unit_price)}
            </div>
          </div>
          <span className="line-amt">{money(lineTotal(l))}</span>
          {onRemove && (
            <button className="line-x" onClick={() => onRemove(l.id)} aria-label={`Remove ${l.name}`}>
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="totals">
        <div>
          <span>Subtotal</span>
          <span>{money(t.subtotal)}</span>
        </div>
        {t.discount > 0 && (
          <div className="disc">
            <span>Discount</span>
            <span>−{money(t.discount)}</span>
          </div>
        )}
        {gst && (
          <div>
            <span>GST (10%)</span>
            <span>{money(t.gst)}</span>
          </div>
        )}
      </div>
      <div className="grand">
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>{caption}</div>
          <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>
            {gst ? 'AUD, includes GST' : 'AUD, no GST applied'}
          </div>
        </div>
        <b>{money(t.total)}</b>
      </div>
      {footer}
    </div>
  )
}
