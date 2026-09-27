import { useState } from 'react'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { loadAddons, loadClients, loadServices, loadStaff, upsertClientFrom } from '../lib/data'
import { FREQUENCIES } from '../lib/status'
import { must, supabase } from '../lib/supabase'
import { computeTotals } from '../lib/totals'
import { money } from '../lib/format'
import type { Client, Job, LineItem } from '../lib/types'
import { LineBuilder } from './LineBuilder'
import { Avatar, Field, MoneyInput, Sheet, Spinner, Switch, useToast } from './ui'

type Draft = Pick<
  Job,
  'customer' | 'phone' | 'email' | 'address' | 'line_items' | 'gst' | 'discount' | 'scheduled_date' | 'scheduled_time' | 'frequency' | 'staff_id' | 'client_id' | 'notes' | 'status'
>

const blank: Draft = {
  customer: '',
  phone: '',
  email: '',
  address: '',
  line_items: [],
  gst: true,
  discount: 0,
  scheduled_date: null,
  scheduled_time: null,
  frequency: 'One-off',
  staff_id: null,
  client_id: null,
  notes: '',
  status: 'New',
}

export const serviceSummary = (items: LineItem[]) =>
  items
    .filter((i) => i.kind === 'service')
    .map((i) => i.name)
    .join(' + ') || items[0]?.name || null

export function JobFormSheet({
  job,
  presetClient,
  presetDate,
  bookOnSave,
  onClose,
  onSaved,
}: {
  /** Saving with a date moves a New / Quote Sent job to Job Scheduled. */
  bookOnSave?: boolean
  job?: Job
  presetClient?: Client
  presetDate?: string
  onClose: () => void
  onSaved: (job: Job) => void
}) {
  const { bid } = useBiz()
  const toast = useToast()
  const { data: lookups } = useLoad(async () => {
    const [services, addons, staff, clients] = await Promise.all([loadServices(bid), loadAddons(bid), loadStaff(bid), loadClients(bid)])
    return { services, addons, staff, clients }
  }, [bid])
  const [d, setD] = useState<Draft>(() =>
    job
      ? (Object.fromEntries(Object.keys(blank).map((k) => [k, job[k as keyof Draft]])) as Draft)
      : {
          ...blank,
          scheduled_date: presetDate || null,
          ...(presetClient
            ? {
                client_id: presetClient.id,
                customer: presetClient.name,
                phone: presetClient.phone,
                email: presetClient.email,
                address: presetClient.addresses[0]?.line || '',
              }
            : {}),
        },
  )
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const client = lookups?.clients.find((c) => c.id === d.client_id)
  const totals = computeTotals(d.line_items, d.discount, d.gst)

  const save = async () => {
    if (!d.customer.trim()) return toast('Add a customer name', true)
    setBusy(true)
    try {
      const client_id = d.client_id || (await upsertClientFrom(bid, { name: d.customer, phone: d.phone, email: d.email, address: d.address }))
      // A new job with a date and crew is booked; otherwise it's a request.
      let status = d.status
      if ((!job || bookOnSave) && d.scheduled_date && (status === 'New' || status === 'Quote Sent')) status = 'Job Scheduled'
      const row = {
        ...d,
        client_id,
        status,
        customer: d.customer.trim(),
        service: serviceSummary(d.line_items) || job?.service || null,
        scheduled_time: d.scheduled_time || null,
        scheduled_date: d.scheduled_date || null,
        ...(d.line_items.length === 0 ? { price: 0 } : {}),
      }
      const saved = job
        ? (must(await supabase.from('jobs').update(row).eq('id', job.id).select('*').single()) as Job)
        : (must(await supabase.from('jobs').insert({ ...row, business_id: bid, source: 'manual' }).select('*').single()) as Job)
      toast(job ? 'Job updated' : `Job ${saved.num} created`)
      onSaved(saved)
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      wide
      title={job ? `Edit ${job.num}` : 'New job'}
      onClose={onClose}
      footer={
        <>
          <div className="grow">
            <div className="faint" style={{ fontSize: 11, fontWeight: 700 }}>
              TOTAL {d.gst ? 'INC GST' : ''}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800 }} className="num">
              {money(totals.total)}
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={save} disabled={busy}>
            {busy ? <Spinner /> : job ? 'Save changes' : 'Create job'}
          </button>
        </>
      }
    >
      {!lookups ? (
        <Spinner />
      ) : (
        <div className="stack">
          <div className="section-label">Customer</div>
          {lookups.clients.length > 0 && (
            <Field label="Existing client">
              <select
                className="select"
                value={d.client_id || ''}
                onChange={(e) => {
                  const c = lookups.clients.find((x) => x.id === e.target.value)
                  if (!c) return set({ client_id: null })
                  set({ client_id: c.id, customer: c.name, phone: c.phone, email: c.email, address: c.addresses[0]?.line || d.address })
                }}
              >
                <option value="">— New customer —</option>
                {lookups.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-grid cols-2">
            <Field label="Name" className="span-2">
              <input className="input" value={d.customer} onChange={(e) => set({ customer: e.target.value })} placeholder="Customer name" />
            </Field>
            <Field label="Phone">
              <input className="input" inputMode="tel" value={d.phone || ''} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={d.email || ''} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Job address" className="span-2">
              {client && client.addresses.length > 1 ? (
                <select className="select" value={d.address || ''} onChange={(e) => set({ address: e.target.value })}>
                  {client.addresses.map((a) => (
                    <option key={a.line} value={a.line}>
                      {a.label ? `${a.label} — ` : ''}
                      {a.line}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input" value={d.address || ''} onChange={(e) => set({ address: e.target.value })} placeholder="12 Example St, Suburb NSW 2000" />
              )}
            </Field>
          </div>

          <div className="section-label" style={{ marginTop: 6 }}>
            Work
          </div>
          <LineBuilder items={d.line_items} onChange={(line_items) => set({ line_items })} services={lookups.services} addons={lookups.addons} />
          <div className="form-grid cols-2">
            <Field label="Discount ($, ex GST)">
              <MoneyInput value={d.discount} onChange={(discount) => set({ discount })} />
            </Field>
            <div className="field">
              <span>GST</span>
              <div className="row" style={{ height: 46 }}>
                <Switch checked={d.gst} onChange={(gst) => set({ gst })} label="Charge GST" />
                <span style={{ fontWeight: 600 }}>{d.gst ? 'Add 10% GST' : 'No GST'}</span>
              </div>
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 6 }}>
            Schedule
          </div>
          <div className="form-grid cols-2">
            <Field label="Date">
              <input className="input" type="date" value={d.scheduled_date || ''} onChange={(e) => set({ scheduled_date: e.target.value || null })} />
            </Field>
            <Field label="Time">
              <input className="input" type="time" value={d.scheduled_time?.slice(0, 5) || ''} onChange={(e) => set({ scheduled_time: e.target.value || null })} />
            </Field>
            <Field label="Frequency" className="span-2">
              <select className="select" value={d.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                {FREQUENCIES.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="field">
            <span>Crew</span>
            <div className="seg wrap" style={{ overflow: 'visible' }}>
              <button type="button" className={`chip soft ${!d.staff_id ? 'on' : ''}`} onClick={() => set({ staff_id: null })}>
                Unassigned
              </button>
              {lookups.staff
                .filter((s) => s.active)
                .map((s) => (
                  <button key={s.id} type="button" className={`chip soft ${d.staff_id === s.id ? 'on' : ''}`} onClick={() => set({ staff_id: s.id })}>
                    <Avatar name={s.name} colour={s.colour} /> {s.name}
                  </button>
                ))}
            </div>
          </div>
          <Field label="Notes for the crew">
            <textarea className="textarea" value={d.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Gate code, dog in yard, where to park…" />
          </Field>
        </div>
      )}
    </Sheet>
  )
}
