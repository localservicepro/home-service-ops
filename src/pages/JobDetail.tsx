import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { loadAddons, loadStaff } from '../lib/data'
import { copy, invoiceLink, removeJobPhoto, sendEmail, signedPhotoUrls, uploadJobPhoto } from '../lib/api'
import { dateShort, dateNumeric, directionsUrl, hoursLabel, initials, isoDate, mapEmbedUrl, money, timeLabel } from '../lib/format'
import { JOB_STATUS, PAY_METHOD_LABEL, invoiceNum } from '../lib/status'
import { must, supabase } from '../lib/supabase'
import type { Job, JobStatus, PayMethod, Payment, Photo, Staff } from '../lib/types'
import { Icon } from '../components/Icon'
import { InvoiceLines, StatusPipeline, WorkTimer, elapsedMs } from '../components/job'
import { ExtraSheet } from '../components/LineBuilder'
import { JobFormSheet } from '../components/JobForm'
import { Avatar, Confirm, Field, LoadingPage, MoneyInput, Sheet, Spinner, useAction, useToast } from '../components/ui'

export function JobDetailPage() {
  const { id = '' } = useParams()
  const { bid, isOffice, settings } = useBiz()
  const navigate = useNavigate()
  const toast = useToast()
  const { busy, run } = useAction()
  const [sheet, setSheet] = useState<null | 'assign' | 'extra' | 'pay' | 'cancel' | 'edit' | 'delete' | 'unpay' | 'book'>(null)
  const [unpayTo, setUnpayTo] = useState<JobStatus>('Done')

  const { data, setData, loading, error } = useLoad(async () => {
    const job = must(await supabase.from('jobs').select('*').eq('id', id).single()) as Job
    const [staff, addons, payments] = await Promise.all([
      loadStaff(bid),
      isOffice ? loadAddons(bid) : Promise.resolve([]),
      isOffice
        ? supabase.from('payments').select('*').eq('job_id', id).order('paid_at').then(must).then((r) => r as Payment[])
        : Promise.resolve([] as Payment[]),
    ])
    return { job, staff, addons, payments }
  }, [id, bid, isOffice])

  const job = data?.job
  const photoKey = (job?.photos || []).map((p) => p.path).join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!photoKey) return setUrls({})
    signedPhotoUrls(photoKey.split('|')).then(setUrls)
  }, [photoKey])

  if (loading) return <LoadingPage />
  if (error || !data || !job) {
    return (
      <div className="page">
        <div className="empty">
          <b>Job not found</b>It may have been removed or reassigned.
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-soft btn-sm" onClick={() => navigate(-1)}>
              Go back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const staff = data.staff.find((s) => s.id === job.staff_id) || null
  const invoiceReady = job.status === 'Done' || job.status === 'Paid'
  const balance = Math.max(0, Math.round((Number(job.price) - Number(job.amount_paid)) * 100) / 100)

  const refresh = async () => {
    const [next, payments] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', job.id).single().then(must),
      supabase.from('payments').select('*').eq('job_id', job.id).order('paid_at').then(must),
    ])
    setData({ ...data, job: next as Job, payments: payments as Payment[] })
  }

  const update = async (patch: Partial<Job>, ok?: string) =>
    run(async () => {
      const next = must(await supabase.from('jobs').update(patch).eq('id', job.id).select('*').single()) as Job
      setData({ ...data, job: next })
    }, ok)

  const setDuty = async (duty: Staff['duty']) => {
    if (!staff) return
    if (isOffice) await supabase.from('staff').update({ duty }).eq('id', staff.id)
    else await supabase.rpc('set_my_duty', { bid, d: duty })
  }

  const startWork = async () => {
    await update({ work_state: 'running', work_started_at: new Date().toISOString(), status: 'In Progress' }, 'Timer started')
    setDuty('On job')
  }
  const finishWork = async () => {
    await update({ work_state: 'done', work_elapsed_ms: Math.round(elapsedMs(job)), work_started_at: null, status: 'Done' }, 'Job complete — nice work')
    setDuty('Available')
  }
  const resumeWork = () => update({ work_state: 'running', work_started_at: new Date().toISOString(), status: 'In Progress' })

  const setStatus = (status: JobStatus) => {
    if (status === job.status) return
    // "Paid" is driven by recorded payments, not set by hand.
    if (status === 'Paid') return setSheet('pay')
    if (job.status === 'Paid' || data.payments.length) {
      setUnpayTo(status)
      return setSheet('unpay')
    }
    update({ status }, `Moved to ${status}`)
  }

  const sendInvoice = () =>
    run(async () => {
      const r = await sendEmail('invoice', job.id, invoiceLink(job.public_token))
      setData({ ...data, job: { ...job, invoice_sent_at: new Date().toISOString() } })
      toast(r.message)
    })

  const addPhotos = async (files: FileList | null, kind: Photo['kind']) => {
    if (!files?.length) return
    await run(async () => {
      const added: Photo[] = []
      for (const f of Array.from(files)) added.push(await uploadJobPhoto(job, f, kind))
      const next = must(await supabase.from('jobs').update({ photos: [...job.photos, ...added] }).eq('id', job.id).select('*').single()) as Job
      setData({ ...data, job: next })
    }, `${files.length} photo${files.length > 1 ? 's' : ''} added`)
  }
  const removePhoto = (p: Photo) =>
    run(async () => {
      await removeJobPhoto(p.path)
      const next = must(
        await supabase.from('jobs').update({ photos: job.photos.filter((x) => x.path !== p.path) }).eq('id', job.id).select('*').single(),
      ) as Job
      setData({ ...data, job: next })
    })

  const canWork = ['Job Scheduled', 'In Progress', 'Done', 'Paid'].includes(job.status) || job.work_state !== 'idle'
  const editable = isOffice && job.status !== 'Paid' && job.status !== 'Cancelled'
  const crewPay =
    staff && staff.pay_rate > 0
      ? staff.rate_type === 'hour'
        ? `${money(staff.pay_rate)}/h${job.work_elapsed_ms ? ` · ${money((staff.pay_rate * job.work_elapsed_ms) / 3_600_000)}` : ''}`
        : money(staff.pay_rate)
      : null
  const tone = JOB_STATUS[job.status]
  const before = job.photos.filter((p) => p.kind === 'before')
  const after = job.photos.filter((p) => p.kind === 'after')

  const primary = (() => {
    if (!isOffice) {
      if (job.status === 'Job Scheduled' && job.work_state === 'idle') return { label: 'Start job', act: startWork }
      if (job.work_state === 'running') return { label: 'Finish job', act: finishWork }
      return null
    }
    switch (job.status) {
      case 'New':
        return { label: 'Build & send quote', act: () => navigate(`/quotes/new?job=${job.id}`) }
      case 'Quote Sent':
        return { label: 'Book it in', act: () => setSheet('book') }
      case 'Job Scheduled':
        return job.staff_id ? { label: 'Start job', act: startWork } : { label: 'Assign crew', act: () => setSheet('assign') }
      case 'In Progress':
        return { label: 'Finish job', act: finishWork }
      case 'Done':
        return job.invoice_sent_at || !job.line_items.length
          ? { label: 'Record payment', act: () => setSheet('pay') }
          : { label: 'Send invoice', act: sendInvoice }
      case 'Paid':
        return { label: job.invoice_sent_at ? 'Resend receipt' : 'Send receipt', act: sendInvoice }
      default:
        return null
    }
  })()

  return (
    <div className="page page-narrow">
      <section className="hero">
        <div className="row-between">
          <button className="hero-btn" onClick={() => navigate(-1)} aria-label="Back">
            <Icon name="back" />
          </button>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--on-navy)' }}>
            #{job.num}
          </span>
          {isOffice ? (
            <button className="hero-btn" onClick={() => setSheet('edit')} aria-label="Edit job">
              <Icon name="edit" />
            </button>
          ) : (
            <span style={{ width: 42 }} />
          )}
        </div>
        <span className="pill" style={{ marginTop: 14, color: '#fff', background: tone.c, padding: '5px 12px', fontSize: 11 }}>
          {job.status}
        </span>
        <h1 style={{ fontSize: 22, marginTop: 10 }}>{job.service || 'Untitled job'}</h1>
        <div className="sub">
          {dateShort(job.scheduled_date)}
          {job.scheduled_time ? ` · ${timeLabel(job.scheduled_time)}` : ''} · {job.frequency}
        </div>
      </section>

      <div className="card rise">
        <div className="section-label" style={{ marginBottom: 14 }}>
          Status pipeline
        </div>
        <StatusPipeline status={job.status} onPick={isOffice ? setStatus : undefined} />
      </div>

      {canWork && (
        <div className="rise rise-1" style={{ marginTop: 14 }}>
          <WorkTimer job={job} busy={busy} onStart={startWork} onFinish={finishWork} onResume={isOffice ? resumeWork : undefined} />
        </div>
      )}

      {canWork && (
        <div className="card rise rise-1" style={{ marginTop: 14 }}>
          <div className="card-title">
            <span className="section-label">Job photos</span>
            <span className="faint" style={{ fontSize: 11.5, fontWeight: 600 }}>
              Before / after proof
            </span>
          </div>
          {(['before', 'after'] as const).map((kind) => (
            <div key={kind} style={{ marginBottom: kind === 'before' ? 14 : 0 }}>
              <div className="faint" style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                {kind} · {(kind === 'before' ? before : after).length}
              </div>
              <div className="photos">
                {(kind === 'before' ? before : after).map((p) => (
                  <div key={p.path} className="photo">
                    {urls[p.path] ? (
                      <a href={urls[p.path]} target="_blank" rel="noreferrer">
                        <img src={urls[p.path]} alt={`${kind} photo`} loading="lazy" />
                      </a>
                    ) : (
                      <div className="loading-page" style={{ minHeight: '100%' }}>
                        <Spinner />
                      </div>
                    )}
                    <em>{kind}</em>
                    <button onClick={() => removePhoto(p)} aria-label="Remove photo">
                      ✕
                    </button>
                  </div>
                ))}
                <label className="photo-add">
                  <Icon name="camera" />
                  Add {kind}
                  <input type="file" accept="image/*" multiple capture="environment" onChange={(e) => addPhotos(e.target.files, kind)} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card rise rise-2" style={{ marginTop: 14 }}>
        <div className="row-between">
          <div className="row">
            <span className="avatar sq lg">{initials(job.customer)}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {isOffice && job.client_id ? <Link to={`/clients/${job.client_id}`}>{job.customer}</Link> : job.customer}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {job.phone || 'No phone'}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {job.phone && (
              <a className="btn btn-soft btn-icon" href={`tel:${job.phone.replace(/\s/g, '')}`} aria-label="Call customer">
                <Icon name="phone" size={18} />
              </a>
            )}
            {job.phone && (
              <a className="btn btn-soft btn-icon" href={`sms:${job.phone.replace(/\s/g, '')}`} aria-label="Text customer">
                <Icon name="send" size={18} />
              </a>
            )}
            {job.email && (
              <a className="btn btn-soft btn-icon" href={`mailto:${job.email}`} aria-label="Email customer">
                <Icon name="mail" size={18} />
              </a>
            )}
          </div>
        </div>
        {job.address && (
          <>
            <div className="map">
              <iframe src={mapEmbedUrl(job.address)} title="Map of job address" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Icon name="pin" style={{ color: 'var(--blue)', flex: 'none' }} />
              <span className="grow" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)' }}>
                {job.address}
              </span>
              <a className="btn btn-primary btn-sm" href={directionsUrl(job.address)} target="_blank" rel="noreferrer">
                <Icon name="nav" size={15} /> Directions
              </a>
            </div>
          </>
        )}
      </div>

      <div className="card rise rise-2" style={{ marginTop: 14 }}>
        <div className="card-title">
          <span className="section-label">Assigned crew</span>
          {isOffice && (
            <button className="link-btn" onClick={() => setSheet('assign')}>
              {staff ? 'Change' : 'Assign'}
            </button>
          )}
        </div>
        {staff ? (
          <div className="row">
            <Avatar name={staff.name} colour={staff.colour} size="lg" />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{isOffice ? <Link to={`/crew/${staff.id}`}>{staff.name}</Link> : staff.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {staff.role}
                {job.work_elapsed_ms > 0 ? ` · ${hoursLabel(job.work_elapsed_ms)} on site` : ''}
              </div>
            </div>
            {isOffice && crewPay && (
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-tint)', padding: '6px 11px', borderRadius: 10 }}>{crewPay}</span>
            )}
          </div>
        ) : (
          <div className="row muted" style={{ fontWeight: 600 }}>
            <Avatar /> Not assigned yet
          </div>
        )}
      </div>

      {job.notes && (
        <div className="card rise rise-3" style={{ marginTop: 14 }}>
          <span className="section-label">Job notes</span>
          <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{job.notes}</p>
        </div>
      )}

      {isOffice && (
        <div className="card rise rise-3" style={{ marginTop: 14 }}>
          <div className="card-title">
            <div className="row" style={{ gap: 8 }}>
              <span className="section-label">Invoice</span>
              <span className="mono faint" style={{ fontSize: 10.5 }}>
                {invoiceNum(job.num)}
                {job.invoice_sent_at ? ` · sent ${dateNumeric(job.invoice_sent_at)}` : ''}
              </span>
            </div>
            {editable && (
              <button className="btn btn-soft btn-sm" onClick={() => setSheet('extra')}>
                + Add extra
              </button>
            )}
          </div>
          <InvoiceLines
            items={job.line_items}
            discount={job.discount}
            gst={job.gst}
            caption="Total"
            onRemove={editable ? (lid) => update({ line_items: job.line_items.filter((l) => l.id !== lid) }) : undefined}
            footer={
              <>
                {data.payments.map((p) => (
                  <div key={p.id} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--green-tint)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flex: 'none' }}>
                      ✓
                    </span>
                    <span className="grow" style={{ fontWeight: 600 }}>
                      {PAY_METHOD_LABEL[p.method]} · {dateNumeric(p.paid_at)}
                      {p.note ? <span className="muted"> · {p.note}</span> : null}
                    </span>
                    <b className="num" style={{ color: 'var(--green)' }}>
                      −{money(p.amount)}
                    </b>
                    <button
                      className="line-x"
                      aria-label="Remove payment"
                      onClick={() =>
                        run(async () => {
                          must(await supabase.from('payments').delete().eq('id', p.id))
                          await refresh()
                        }, 'Payment removed')
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {job.pay_state === 'paid' ? (
                  <div className="paid-banner">
                    <i>✓</i> Paid in full{job.pay_method ? ` · ${PAY_METHOD_LABEL[job.pay_method]}` : ''} · {dateNumeric(job.paid_at)}
                  </div>
                ) : data.payments.length > 0 ? (
                  <div className="row-between" style={{ marginTop: 10, padding: '10px 12px', background: 'var(--amber-tint)', borderRadius: 12, color: '#8a5510', fontWeight: 700, fontSize: 13 }}>
                    <span>Balance due</span>
                    <span className="num">{money(balance)}</span>
                  </div>
                ) : null}
              </>
            }
          />
          <div className="row wrap" style={{ marginTop: 14 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={sendInvoice}
              disabled={busy || job.line_items.length === 0 || !invoiceReady}
              title={invoiceReady ? undefined : 'Finish the job before sending the invoice'}
            >
              <Icon name="send" /> {job.invoice_sent_at ? 'Resend invoice' : 'Send invoice'}
            </button>
            <a className="btn btn-ghost btn-sm" href={invoiceLink(job.public_token)} target="_blank" rel="noreferrer">
              <Icon name="link" /> View
            </a>
            <button className="btn btn-ghost btn-sm" onClick={async () => (await copy(invoiceLink(job.public_token))) && toast('Invoice link copied')}>
              <Icon name="copy" /> Copy link
            </button>
            {job.pay_state !== 'paid' && job.status !== 'Cancelled' && (
              <button className="btn btn-soft btn-sm" onClick={() => setSheet('pay')}>
                <Icon name="dollar" /> Record payment
              </button>
            )}
          </div>
        </div>
      )}

      {(primary || isOffice) && (
        <div className="action-bar">
          {isOffice && job.status !== 'Cancelled' && job.status !== 'Paid' && (
            <button className="btn btn-danger" style={{ width: 54, flex: 'none' }} onClick={() => setSheet('cancel')} aria-label="Cancel job">
              ✕
            </button>
          )}
          {isOffice && job.status === 'Cancelled' && (
            <>
              <button className="btn btn-danger" onClick={() => setSheet('delete')}>
                <Icon name="trash" /> Delete
              </button>
              <button className="btn btn-primary grow" onClick={() => setStatus('New')}>
                Reopen job
              </button>
            </>
          )}
          {primary && (
            <button className="btn btn-primary btn-lg grow" onClick={primary.act} disabled={busy}>
              {busy ? <Spinner /> : primary.label}
            </button>
          )}
        </div>
      )}

      {sheet === 'assign' && (
        <Sheet title="Assign crew" onClose={() => setSheet(null)}>
          <div className="list">
            {data.staff
              .filter((s) => s.active)
              .map((s) => (
                <button
                  key={s.id}
                  className="item"
                  onClick={async () => {
                    const patch: Partial<Job> = { staff_id: s.id }
                    if (['New', 'Quote Sent'].includes(job.status) && job.scheduled_date) patch.status = 'Job Scheduled'
                    await update(patch, `Assigned to ${s.name}`)
                    setSheet(null)
                  }}
                >
                  <Avatar name={s.name} colour={s.colour} size="lg" />
                  <div className="grow">
                    <div className="item-title">{s.name}</div>
                    <div className="item-sub">
                      {s.role} · {s.duty}
                    </div>
                  </div>
                  {s.id === job.staff_id && <Icon name="check" style={{ color: 'var(--blue)' }} />}
                </button>
              ))}
            {job.staff_id && (
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await update({ staff_id: null }, 'Unassigned')
                  setSheet(null)
                }}
              >
                Unassign
              </button>
            )}
            {data.staff.length === 0 && (
              <div className="empty">
                <b>No crew yet</b>
                <Link to="/crew">Add your first crew member</Link>
              </div>
            )}
          </div>
        </Sheet>
      )}

      {sheet === 'extra' && (
        <ExtraSheet
          addons={data.addons}
          onClose={() => setSheet(null)}
          onAdd={async (li) => {
            await update({ line_items: [...job.line_items, li] }, `${li.name} added`)
            setSheet(null)
          }}
        />
      )}

      {sheet === 'pay' && (
        <PaymentSheet
          job={job}
          balance={balance}
          methods={settings?.payment_methods?.length ? settings.payment_methods : ['cash', 'bank', 'card']}
          bank={settings}
          onClose={() => setSheet(null)}
          onPaid={async (p) => {
            const ok = await run(async () => {
              must(await supabase.from('payments').insert({ business_id: job.business_id, job_id: job.id, ...p }))
              await refresh()
            }, `${money(p.amount)} recorded`)
            if (ok) setSheet(null)
          }}
        />
      )}

      {sheet === 'unpay' && (
        <Confirm
          title={`Move back to ${unpayTo}?`}
          body={`This removes ${data.payments.length === 1 ? 'the recorded payment' : `all ${data.payments.length} recorded payments`} (${money(job.amount_paid)}) from ${job.num}.`}
          confirmLabel="Remove payments & move"
          danger
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            await run(async () => {
              must(await supabase.from('payments').delete().eq('job_id', job.id))
              must(await supabase.from('jobs').update({ status: unpayTo }).eq('id', job.id))
              await refresh()
            }, `Moved to ${unpayTo}`)
          }}
        />
      )}

      {sheet === 'cancel' && (
        <Confirm
          title="Cancel this job?"
          body={`${job.num} for ${job.customer} will move to Cancelled. You can reopen it later.`}
          confirmLabel="Cancel job"
          danger
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            await update({ status: 'Cancelled', work_state: job.work_state === 'running' ? 'done' : job.work_state }, 'Job cancelled')
          }}
        />
      )}

      {sheet === 'delete' && (
        <Confirm
          title="Delete this job?"
          body="This permanently removes the job, its photos and invoice. This can’t be undone."
          confirmLabel="Delete forever"
          danger
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            if (job.photos.length) await supabase.storage.from('job-photos').remove(job.photos.map((p) => p.path))
            must(await supabase.from('jobs').delete().eq('id', job.id))
            toast('Job deleted')
            navigate('/jobs', { replace: true })
          }}
        />
      )}

      {(sheet === 'edit' || sheet === 'book') && (
        <JobFormSheet
          job={job}
          bookOnSave={sheet === 'book'}
          onClose={() => setSheet(null)}
          onSaved={(next) => {
            setData({ ...data, job: next })
            setSheet(null)
          }}
        />
      )}
    </div>
  )
}

interface NewPayment {
  amount: number
  method: PayMethod
  paid_at: string
  note: string | null
}

function PaymentSheet({
  job,
  balance,
  methods,
  bank,
  onClose,
  onPaid,
}: {
  job: Job
  balance: number
  methods: PayMethod[]
  bank: { bank_account_name: string | null; bank_bsb: string | null; bank_account_number: string | null; online_payment_url: string | null } | null
  onClose: () => void
  onPaid: (p: NewPayment) => Promise<void>
}) {
  const [method, setMethod] = useState<PayMethod>(methods[0])
  const [amount, setAmount] = useState(balance)
  const [date, setDate] = useState(isoDate())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const part = amount > 0 && amount < balance
  return (
    <Sheet
      title="Record payment"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary btn-lg btn-block"
          disabled={busy || amount <= 0}
          onClick={async () => {
            setBusy(true)
            // Today → now (keeps ordering); earlier dates → midday local so the day never shifts.
            const paid_at = date === isoDate() ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString()
            await onPaid({ amount, method, paid_at, note: note.trim() || null })
            setBusy(false)
          }}
        >
          {busy ? <Spinner /> : part ? `Record ${money(amount)} part-payment` : `Record ${money(amount)} paid`}
        </button>
      }
    >
      <div className="stack">
        <div className="center" style={{ padding: '6px 0 4px' }}>
          <div className="section-label">{Number(job.amount_paid) > 0 ? 'Balance due' : 'Amount due'}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em' }} className="num">
            {money(balance)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {job.customer} · {job.num}
            {Number(job.amount_paid) > 0 ? ` · ${money(job.amount_paid)} of ${money(job.price)} paid` : ''}
          </div>
        </div>
        <div className="tabs">
          {methods.map((m) => (
            <button key={m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
              {PAY_METHOD_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="form-grid cols-2">
          <Field label="Amount received">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Date received">
            <input className="input" type="date" max={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note (optional)" className="span-2">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Receipt #, deposit, etc." />
          </Field>
        </div>
        {method === 'bank' && (
          <div className="card" style={{ background: 'var(--blue-tint-2)' }}>
            <div className="kv">
              <span>Account name</span>
              <span>{bank?.bank_account_name || '—'}</span>
            </div>
            <div className="kv">
              <span>BSB</span>
              <span className="mono">{bank?.bank_bsb || '—'}</span>
            </div>
            <div className="kv">
              <span>Account no.</span>
              <span className="mono">{bank?.bank_account_number || '—'}</span>
            </div>
            <div className="kv">
              <span>Reference</span>
              <span className="mono">{job.num}</span>
            </div>
            {!bank?.bank_bsb && (
              <div className="note warn" style={{ marginTop: 8 }}>
                Add your bank details in Settings → Payments so they appear on invoices.
              </div>
            )}
          </div>
        )}
        {method === 'card' && !bank?.online_payment_url && (
          <div className="note">Took card on a terminal? Record it here. Add a payment link in Settings → Payments to show a “Pay by card” button on invoices.</div>
        )}
      </div>
    </Sheet>
  )
}
