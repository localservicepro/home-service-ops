import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { loadAddons, loadServices, loadStaff } from '../lib/data'
import { copy, inviteLink, requestPasswordReset, sendEmail, uploadLogo } from '../lib/api'
import { dateLong, money, relTime } from '../lib/format'
import { FREQUENCIES, PAY_METHODS, PAY_METHOD_LABEL } from '../lib/status'
import { tradeByKey } from '../lib/starterPacks'
import { must, supabase } from '../lib/supabase'
import type { Addon, Invite, Membership, PayMethod, Role, Service, Settings } from '../lib/types'
import { Icon } from '../components/Icon'
import { Confirm, Field, LoadingPage, MoneyInput, Pill, Sheet, Spinner, Switch, useAction, useToast } from '../components/ui'

const SECTIONS = [
  { key: 'business', label: 'Business' },
  { key: 'owner', label: 'Owner' },
  { key: 'payments', label: 'Payments & bank' },
  { key: 'services', label: 'Services & add-ons' },
  { key: 'team', label: 'Team & invites' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'plan', label: 'Plan & billing' },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const section = (params.get('tab') as SectionKey) || 'business'
  const { signOut, role } = useBiz()
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section-label">Workspace</div>
          <h1>Settings</h1>
        </div>
        <button className="btn btn-ghost only-phone" onClick={signOut}>
          <Icon name="logout" /> Sign out
        </button>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.filter((s) => role === 'owner' || s.key !== 'plan').map((s) => (
            <button key={s.key} className={`chip ${section === s.key ? 'on' : ''}`} onClick={() => setParams({ tab: s.key })}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="rise" key={section}>
          {section === 'business' && <BusinessSection />}
          {section === 'owner' && <OwnerSection />}
          {section === 'payments' && <PaymentsSection />}
          {section === 'services' && <ServicesSection />}
          {section === 'team' && <TeamSection />}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'plan' && <PlanSection />}
        </div>
      </div>
    </div>
  )
}

/** Shared editable form over the settings row. */
function useSettingsForm<K extends keyof Settings>(keys: K[]) {
  const { settings, bid, reload } = useBiz()
  const { busy, run } = useAction()
  const [f, setF] = useState(() => Object.fromEntries(keys.map((k) => [k, settings?.[k] ?? ''])) as Pick<Settings, K>)
  const save = (extra?: () => Promise<unknown>) =>
    run(async () => {
      const patch = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))
      must(await supabase.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('business_id', bid))
      await extra?.()
      await reload()
    }, 'Saved')
  const bind = (k: K) => ({
    value: (f[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
  })
  return { f, setF, save, busy, bind }
}

function SaveBar({ busy, onSave }: { busy: boolean; onSave: () => void }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
      <button className="btn btn-primary" onClick={onSave} disabled={busy}>
        {busy ? <Spinner /> : 'Save changes'}
      </button>
    </div>
  )
}

function Card({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card">
      <div className="card-title" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          {sub && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {sub}
            </div>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function BusinessSection() {
  const { bid, business } = useBiz()
  const toast = useToast()
  const { f, setF, save, busy, bind } = useSettingsForm(['business_name', 'abn', 'phone', 'email', 'address', 'logo_url'])
  const [uploading, setUploading] = useState(false)
  return (
    <Card title="Business details" sub="Shown on quotes and invoices your customers see.">
      <div className="row" style={{ marginBottom: 16 }}>
        <div
          style={{ width: 64, height: 64, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--blue-tint-2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}
        >
          {f.logo_url ? <img src={f.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="camera" style={{ color: 'var(--faint)' }} />}
        </div>
        <label className="btn btn-soft btn-sm" style={{ cursor: 'pointer' }}>
          {uploading ? <Spinner /> : f.logo_url ? 'Change logo' : 'Upload logo'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploading(true)
              try {
                setF({ ...f, logo_url: await uploadLogo(bid, file) })
              } catch (err) {
                toast((err as Error).message, true)
              }
              setUploading(false)
            }}
          />
        </label>
        {f.logo_url && (
          <button className="link-btn" style={{ color: 'var(--red)' }} onClick={() => setF({ ...f, logo_url: null })}>
            Remove
          </button>
        )}
      </div>
      <div className="form-grid cols-2">
        <Field label="Trading name" className="span-2">
          <input className="input" {...bind('business_name')} />
        </Field>
        <Field label="ABN">
          <input className="input" inputMode="numeric" placeholder="12 345 678 901" {...bind('abn')} />
        </Field>
        <Field label="Phone">
          <input className="input" inputMode="tel" {...bind('phone')} />
        </Field>
        <Field label="Email" className="span-2">
          <input className="input" type="email" {...bind('email')} />
        </Field>
        <Field label="Address" className="span-2">
          <input className="input" {...bind('address')} />
        </Field>
      </div>
      {business.trade && (
        <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
          Trade: {tradeByKey(business.trade)?.label || business.trade}
        </div>
      )}
      <SaveBar
        busy={busy}
        onSave={() =>
          save(async () => {
            if (f.business_name) await supabase.from('businesses').update({ name: f.business_name }).eq('id', bid)
          })
        }
      />
    </Card>
  )
}

function OwnerSection() {
  const { user } = useBiz()
  const { save, busy, bind } = useSettingsForm(['owner_name', 'owner_phone', 'owner_email'])
  const toast = useToast()
  return (
    <div className="stack">
      <Card title="Owner" sub="Your contact details for the business.">
        <div className="form-grid cols-2">
          <Field label="Name" className="span-2">
            <input className="input" {...bind('owner_name')} />
          </Field>
          <Field label="Mobile">
            <input className="input" inputMode="tel" {...bind('owner_phone')} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" {...bind('owner_email')} />
          </Field>
        </div>
        <SaveBar busy={busy} onSave={() => save()} />
      </Card>
      <Card title="Login" sub={`Signed in as ${user?.email}`}>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await requestPasswordReset(user!.email!)
            toast('Password reset link sent to your email')
          }}
        >
          Send password reset email
        </button>
      </Card>
    </div>
  )
}

function PaymentsSection() {
  const { f, setF, save, busy, bind } = useSettingsForm([
    'payment_methods',
    'bank_account_name',
    'bank_bsb',
    'bank_account_number',
    'payment_terms_days',
    'online_payment_url',
  ])
  const methods = (f.payment_methods as PayMethod[]) || []
  const toggle = (m: PayMethod) => setF({ ...f, payment_methods: methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m] })
  return (
    <div className="stack">
      <Card title="Accepted payment methods" sub="Offered when recording payment and shown on invoices.">
        {PAY_METHODS.map((m) => (
          <div key={m} className="int-row">
            <div className="grow" style={{ fontWeight: 700 }}>
              {PAY_METHOD_LABEL[m]}
            </div>
            <Switch checked={methods.includes(m)} onChange={() => toggle(m)} label={PAY_METHOD_LABEL[m]} />
          </div>
        ))}
      </Card>
      <Card title="Bank details" sub="Printed on invoices for bank transfer (EFT).">
        <div className="form-grid cols-2">
          <Field label="Account name" className="span-2">
            <input className="input" {...bind('bank_account_name')} />
          </Field>
          <Field label="BSB">
            <input className="input mono" inputMode="numeric" placeholder="062-000" {...bind('bank_bsb')} />
          </Field>
          <Field label="Account number">
            <input className="input mono" inputMode="numeric" {...bind('bank_account_number')} />
          </Field>
          <Field label="Payment terms (days)">
            <input
              className="input"
              inputMode="numeric"
              value={f.payment_terms_days ?? 7}
              onChange={(e) => setF({ ...f, payment_terms_days: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            />
          </Field>
          <Field label="Online payment link (optional)">
            <input className="input" placeholder="https://buy.stripe.com/…" {...bind('online_payment_url')} />
          </Field>
        </div>
        <SaveBar busy={busy} onSave={() => save()} />
      </Card>
    </div>
  )
}

function ServicesSection() {
  const { bid } = useBiz()
  const { data, loading, reload } = useLoad(async () => {
    const [services, addons] = await Promise.all([loadServices(bid), loadAddons(bid)])
    return { services, addons }
  }, [bid])
  const [editSvc, setEditSvc] = useState<Service | 'new' | null>(null)
  const [editAddon, setEditAddon] = useState<Addon | 'new' | null>(null)
  if (loading || !data) return <LoadingPage />
  return (
    <div className="stack">
      <Card
        title="Services"
        sub="Prices are ex GST."
        action={
          <button className="btn btn-soft btn-sm" onClick={() => setEditSvc('new')}>
            <Icon name="plus" /> Service
          </button>
        }
      >
        {data.services.length === 0 && <div className="muted">No services yet.</div>}
        {data.services.map((s) => (
          <button key={s.id} className="int-row" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit', opacity: s.active ? 1 : 0.5 }} onClick={() => setEditSvc(s)}>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {s.frequency}
                {!s.active ? ' · hidden' : ''}
              </div>
            </div>
            <b className="num">{money(s.price)}</b>
            <Icon name="chevron" size={16} style={{ color: 'var(--faint)' }} />
          </button>
        ))}
      </Card>
      <Card
        title="Add-ons"
        sub="Extras offered alongside linked services."
        action={
          <button className="btn btn-soft btn-sm" onClick={() => setEditAddon('new')}>
            <Icon name="plus" /> Add-on
          </button>
        }
      >
        {data.addons.length === 0 && <div className="muted">No add-ons yet.</div>}
        {data.addons.map((a) => (
          <button key={a.id} className="int-row" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit', opacity: a.active ? 1 : 0.5 }} onClick={() => setEditAddon(a)}>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{a.name}</div>
              <div className="muted ellipsis" style={{ fontSize: 12 }}>
                {a.service_ids.length === 0 ? 'All services' : a.service_ids.map((id) => data.services.find((s) => s.id === id)?.name).filter(Boolean).join(', ')}
              </div>
            </div>
            <b className="num">{money(a.price)}</b>
            <Icon name="chevron" size={16} style={{ color: 'var(--faint)' }} />
          </button>
        ))}
      </Card>
      {editSvc && (
        <ServiceSheet
          service={editSvc === 'new' ? undefined : editSvc}
          sort={data.services.length}
          onClose={() => setEditSvc(null)}
          onSaved={() => {
            setEditSvc(null)
            reload()
          }}
        />
      )}
      {editAddon && (
        <AddonSheet
          addon={editAddon === 'new' ? undefined : editAddon}
          services={data.services}
          onClose={() => setEditAddon(null)}
          onSaved={() => {
            setEditAddon(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function ServiceSheet({ service, sort, onClose, onSaved }: { service?: Service; sort: number; onClose: () => void; onSaved: () => void }) {
  const { bid } = useBiz()
  const { busy, run } = useAction()
  const [f, setF] = useState({ name: service?.name || '', price: Number(service?.price) || 0, frequency: service?.frequency || 'One-off', active: service?.active ?? true })
  const save = () =>
    run(async () => {
      if (service) must(await supabase.from('services').update(f).eq('id', service.id))
      else must(await supabase.from('services').insert({ ...f, business_id: bid, sort }))
      onSaved()
    }, 'Service saved')
  return (
    <Sheet
      title={service ? 'Edit service' : 'New service'}
      onClose={onClose}
      footer={
        <>
          {service && (
            <button
              className="btn btn-danger"
              onClick={() =>
                run(async () => {
                  must(await supabase.from('services').delete().eq('id', service.id))
                  onSaved()
                }, 'Service deleted')
              }
            >
              <Icon name="trash" />
            </button>
          )}
          <button className="btn btn-primary btn-lg grow" disabled={!f.name.trim() || busy} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <div className="form-grid cols-2">
          <Field label="Price (ex GST)">
            <MoneyInput value={f.price} onChange={(price) => setF({ ...f, price })} />
          </Field>
          <Field label="Usual frequency">
            <select className="select" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
              {FREQUENCIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Show in quote builder
        </label>
      </div>
    </Sheet>
  )
}

function AddonSheet({ addon, services, onClose, onSaved }: { addon?: Addon; services: Service[]; onClose: () => void; onSaved: () => void }) {
  const { bid } = useBiz()
  const { busy, run } = useAction()
  const [f, setF] = useState({ name: addon?.name || '', price: Number(addon?.price) || 0, service_ids: addon?.service_ids || [], active: addon?.active ?? true })
  const save = () =>
    run(async () => {
      if (addon) must(await supabase.from('addons').update(f).eq('id', addon.id))
      else must(await supabase.from('addons').insert({ ...f, business_id: bid }))
      onSaved()
    }, 'Add-on saved')
  return (
    <Sheet
      title={addon ? 'Edit add-on' : 'New add-on'}
      onClose={onClose}
      footer={
        <>
          {addon && (
            <button
              className="btn btn-danger"
              onClick={() =>
                run(async () => {
                  must(await supabase.from('addons').delete().eq('id', addon.id))
                  onSaved()
                }, 'Add-on deleted')
              }
            >
              <Icon name="trash" />
            </button>
          )}
          <button className="btn btn-primary btn-lg grow" disabled={!f.name.trim() || busy} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid cols-2">
          <Field label="Name">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Price (ex GST)">
            <MoneyInput value={f.price} onChange={(price) => setF({ ...f, price })} />
          </Field>
        </div>
        <div className="field">
          <span>Offer with (none selected = all services)</span>
          <div className="seg wrap" style={{ overflow: 'visible' }}>
            {services.map((s) => {
              const on = f.service_ids.includes(s.id)
              return (
                <button key={s.id} className={`chip soft ${on ? 'on' : ''}`} onClick={() => setF({ ...f, service_ids: on ? f.service_ids.filter((x) => x !== s.id) : [...f.service_ids, s.id] })}>
                  {on && <Icon name="check" size={14} />} {s.name}
                </button>
              )
            })}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
        </label>
      </div>
    </Sheet>
  )
}

interface MemberRow extends Membership {
  email?: string
}

function TeamSection() {
  const { bid, user, role } = useBiz()
  const toast = useToast()
  const { busy, run } = useAction()
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<MemberRow | null>(null)
  const { data, loading, reload } = useLoad(async () => {
    const [members, invites, staff] = await Promise.all([
      supabase.from('memberships').select('*').eq('business_id', bid).order('created_at').then(must),
      supabase.from('invites').select('*').eq('business_id', bid).is('accepted_at', null).order('created_at', { ascending: false }).then(must),
      loadStaff(bid),
    ])
    return { members: members as MemberRow[], invites: invites as Invite[], staff }
  }, [bid])
  if (loading || !data) return <LoadingPage />
  const staffName = (id: string | null) => data.staff.find((s) => s.id === id)?.name

  const send = (email: string, r: Exclude<Role, 'owner'>, staff_id: string | null) =>
    run(async () => {
      const inv = must(await supabase.from('invites').insert({ business_id: bid, email, role: r, staff_id, invited_by: user!.id }).select('*').single()) as Invite
      const res = await sendEmail('invite', inv.id, inviteLink(inv.token))
      toast(res.emailed ? `Invite sent to ${email}` : res.message)
      setInviting(false)
      reload()
    })

  return (
    <div className="stack">
      <Card
        title="Team"
        sub="Owners and admins run the office. Crew only see their own jobs."
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setInviting(true)}>
            <Icon name="mail" /> Invite
          </button>
        }
      >
        {data.members.map((m) => (
          <div key={m.id} className="int-row">
            <div className="int-ico" style={{ background: m.role === 'crew' ? 'var(--line-soft)' : 'var(--blue-tint)', color: m.role === 'crew' ? 'var(--muted)' : 'var(--blue)' }}>
              {m.role[0].toUpperCase()}
            </div>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>
                {m.user_id === user?.id ? 'You' : staffName(m.staff_id) || 'Team member'}
              </div>
              <div className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>
                {m.role}
                {m.staff_id && staffName(m.staff_id) ? ` · ${staffName(m.staff_id)}` : ''} · joined {relTime(m.created_at)}
              </div>
            </div>
            {m.role !== 'owner' && m.user_id !== user?.id && (
              <button className="link-btn" style={{ color: 'var(--red)' }} onClick={() => setRemoving(m)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </Card>
      <Card title="Pending invites" sub="Links expire after 7 days.">
        {data.invites.length === 0 && <div className="muted">No pending invites.</div>}
        {data.invites.map((i) => {
          const expired = new Date(i.expires_at) < new Date()
          return (
            <div key={i.id} className="int-row">
              <div className="grow">
                <div style={{ fontWeight: 700 }} className="ellipsis">
                  {i.email}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  <span style={{ textTransform: 'capitalize' }}>{i.role}</span>
                  {i.staff_id ? ` · ${staffName(i.staff_id) || ''}` : ''} · {expired ? 'expired' : `expires ${dateLong(i.expires_at)}`}
                </div>
              </div>
              {expired ? <Pill c="var(--red)" bg="var(--red-tint)">Expired</Pill> : null}
              <button className="btn btn-ghost btn-sm" onClick={async () => (await copy(inviteLink(i.token))) && toast('Invite link copied')} aria-label="Copy invite link">
                <Icon name="copy" />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                aria-label="Revoke invite"
                onClick={() =>
                  run(async () => {
                    must(await supabase.from('invites').delete().eq('id', i.id))
                    reload()
                  }, 'Invite revoked')
                }
              >
                <Icon name="trash" />
              </button>
            </div>
          )
        })}
      </Card>
      {inviting && <InviteMemberSheet staff={data.staff} canAdmin={role === 'owner' || role === 'admin'} busy={busy} onClose={() => setInviting(false)} onSend={send} />}
      {removing && (
        <Confirm
          title="Remove from team?"
          body="They’ll lose access to this business straight away."
          danger
          confirmLabel="Remove"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            must(await supabase.from('memberships').delete().eq('id', removing.id))
            reload()
          }}
        />
      )}
    </div>
  )
}

function InviteMemberSheet({
  staff,
  canAdmin,
  busy,
  onClose,
  onSend,
}: {
  staff: { id: string; name: string; email: string | null }[]
  canAdmin: boolean
  busy: boolean
  onClose: () => void
  onSend: (email: string, role: Exclude<Role, 'owner'>, staffId: string | null) => void
}) {
  const [email, setEmail] = useState('')
  const [r, setR] = useState<Exclude<Role, 'owner'>>('crew')
  const [staffId, setStaffId] = useState<string>('')
  return (
    <Sheet
      title="Invite to the team"
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-lg btn-block" disabled={!/.+@.+\..+/.test(email) || busy || (r === 'crew' && !staffId)} onClick={() => onSend(email.trim(), r, r === 'crew' ? staffId : null)}>
          {busy ? <Spinner /> : 'Send invite'}
        </button>
      }
    >
      <div className="stack">
        <div className="tabs">
          <button className={r === 'crew' ? 'on' : ''} onClick={() => setR('crew')}>
            Crew
          </button>
          {canAdmin && (
            <button className={r === 'admin' ? 'on' : ''} onClick={() => setR('admin')}>
              Office admin
            </button>
          )}
        </div>
        {r === 'crew' && (
          <Field label="Crew record">
            <select
              className="select"
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value)
                const s = staff.find((x) => x.id === e.target.value)
                if (s?.email && !email) setEmail(s.email)
              }}
            >
              <option value="">Choose crew member…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="note">{r === 'crew' ? 'Crew see only jobs assigned to them, and can run the timer and add photos.' : 'Admins can manage jobs, quotes, clients, crew and settings.'}</div>
      </div>
    </Sheet>
  )
}

const INTEGRATIONS = [
  { key: 'google_calendar', name: 'Google Calendar', desc: 'Sync scheduled jobs to your calendar', ico: 'G', bg: '#EAF3FC', c: '#0C6FD0' },
  { key: 'xero', name: 'Xero', desc: 'Push paid invoices to your books', ico: 'X', bg: '#E2F6FD', c: '#0C9BD6' },
  { key: 'stripe', name: 'Stripe', desc: 'Card payments on invoices', ico: 'S', bg: '#EFEAFE', c: '#6D4AE0' },
  { key: 'leadconnector', name: 'LeadConnector', desc: 'Bring website & Google leads in as requests', ico: 'L', bg: '#E3F5EC', c: '#2C9E73' },
  { key: 'sms', name: 'SMS reminders', desc: 'Text customers the day before', ico: '✉', bg: '#FBF1E1', c: '#D98A1F' },
]

function IntegrationsSection() {
  const { settings, bid, reload } = useBiz()
  const toast = useToast()
  const [state, setState] = useState<Record<string, boolean>>(settings?.integrations || {})
  const toggle = async (key: string, on: boolean) => {
    const next = { ...state, [key]: on }
    setState(next)
    const { error } = await supabase.from('settings').update({ integrations: next }).eq('business_id', bid)
    if (error) toast(error.message, true)
    else {
      toast(on ? `${INTEGRATIONS.find((i) => i.key === key)?.name} requested — we’ll let you know when it’s live` : 'Request removed')
      reload()
    }
  }
  return (
    <Card title="Integrations" sub="Coming soon — switch on the ones you want and we’ll enable them for your workspace first.">
      {INTEGRATIONS.map((i) => (
        <div key={i.key} className="int-row">
          <div className="int-ico" style={{ background: i.bg, color: i.c }}>
            {i.ico}
          </div>
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{i.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {i.desc}
            </div>
          </div>
          <Switch checked={Boolean(state[i.key])} onChange={(v) => toggle(i.key, v)} label={i.name} />
        </div>
      ))}
    </Card>
  )
}

const PLANS = [
  { key: 'solo', name: 'Solo', price: 29, blurb: '1 user, unlimited jobs & quotes' },
  { key: 'crew', name: 'Crew', price: 59, blurb: 'Up to 5 crew logins, photos, timers' },
  { key: 'fleet', name: 'Fleet', price: 119, blurb: 'Unlimited crew, integrations, priority support' },
]

function PlanSection() {
  const { business } = useBiz()
  const [confirm, setConfirm] = useState<string | null>(null)
  const trialDays = Math.max(0, Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / 86_400_000))
  const current = PLANS.find((p) => p.key === business.plan)
  return (
    <div className="stack">
      <div className="plan-card">
        <div className="mono-label">Current plan</div>
        <div className="row-between" style={{ marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{current ? current.name : 'Free trial'}</div>
            <div style={{ color: 'var(--on-navy)', fontWeight: 600, fontSize: 13 }}>
              {current ? `${money(current.price)}/month inc GST` : trialDays > 0 ? `${trialDays} days left · ends ${dateLong(business.trial_ends_at)}` : 'Trial ended'}
            </div>
          </div>
          {!current && <b className="price">{trialDays}d</b>}
        </div>
        {!current && (
          <div className="bar" style={{ marginTop: 14, background: 'rgba(255,255,255,.1)' }}>
            <i style={{ width: `${Math.min(100, ((14 - trialDays) / 14) * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="grid-cards">
        {PLANS.map((p) => (
          <div key={p.key} className="card" style={p.key === business.plan ? { borderColor: 'var(--blue)', boxShadow: '0 0 0 3px rgba(12,111,208,.12)' } : undefined}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', margin: '6px 0' }}>
              {money(p.price)}
              <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                /mo
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, minHeight: 36 }}>
              {p.blurb}
            </div>
            <button className={`btn btn-block ${p.key === business.plan ? 'btn-ghost' : 'btn-primary'}`} style={{ marginTop: 12 }} disabled={p.key === business.plan} onClick={() => setConfirm(p.key)}>
              {p.key === business.plan ? 'Current plan' : 'Choose'}
            </button>
          </div>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 12 }}>
        Prices in AUD, GST included. Billing is handled by Local Service Pro — you’ll get a tax invoice each month.
      </div>
      {confirm && (
        <Confirm
          title="Change plan"
          body="Billing isn’t switched on in this workspace yet. We’ll email info@localservicepro.com.au to set up your subscription."
          confirmLabel="Request plan"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            window.location.href = `mailto:info@localservicepro.com.au?subject=${encodeURIComponent(`Plan change: ${business.name} → ${confirm}`)}`
          }}
        />
      )}
    </div>
  )
}
