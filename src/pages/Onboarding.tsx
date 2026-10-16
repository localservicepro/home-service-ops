import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBiz } from '../context/AuthContext'
import { must, supabase } from '../lib/supabase'
import { TRADES, type StarterAddon, type StarterService } from '../lib/starterPacks'
import { CREW_COLOURS, FREQUENCIES } from '../lib/status'
import { inviteLink, sendEmail } from '../lib/api'
import { BrandMark, Icon } from '../components/Icon'
import { Field, MoneyInput, Spinner, useToast } from '../components/ui'

interface CrewDraft {
  name: string
  phone: string
  email: string
  role: string
  invite: boolean
}

const STEPS = ['Your trade', 'Price list', 'Business details', 'Your crew']

export function OnboardingPage() {
  const { bid, business, settings, user, reload } = useBiz()
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [trade, setTrade] = useState<string | null>(business.trade)
  const [services, setServices] = useState<StarterService[]>([])
  const [addons, setAddons] = useState<StarterAddon[]>([])
  const [details, setDetails] = useState({
    business_name: settings?.business_name || business.name,
    abn: settings?.abn || '',
    phone: settings?.phone || '',
    email: settings?.email || user?.email || '',
    address: settings?.address || '',
    owner_name: settings?.owner_name || (user?.user_metadata?.full_name as string) || '',
    owner_phone: settings?.owner_phone || '',
  })
  const [crew, setCrew] = useState<CrewDraft[]>([])
  const [busy, setBusy] = useState(false)

  const pickTrade = (key: string) => {
    const t = TRADES.find((x) => x.key === key)!
    setTrade(key)
    setServices(t.services.map((s) => ({ ...s })))
    setAddons(t.addons.map((a) => ({ ...a })))
  }

  const canNext = step === 0 ? Boolean(trade) : step === 2 ? details.business_name.trim().length > 0 : true

  const finish = async () => {
    setBusy(true)
    try {
      // 1. Price list
      const svcRows = services
        .filter((s) => s.name.trim())
        .map((s, i) => ({ business_id: bid, name: s.name.trim(), price: s.price, frequency: s.frequency, sort: i }))
      const inserted = svcRows.length
        ? (must(await supabase.from('services').insert(svcRows).select('id,name')) as { id: string; name: string }[])
        : []
      const idByName = Object.fromEntries(inserted.map((s) => [s.name, s.id]))
      const addonRows = addons
        .filter((a) => a.name.trim())
        .map((a) => ({
          business_id: bid,
          name: a.name.trim(),
          price: a.price,
          service_ids: a.for.map((n) => idByName[n]).filter(Boolean),
        }))
      if (addonRows.length) must(await supabase.from('addons').insert(addonRows))

      // 2. Business details
      must(await supabase.from('settings').update({ ...details, owner_email: user?.email }).eq('business_id', bid))
      must(
        await supabase
          .from('businesses')
          .update({ name: details.business_name.trim(), trade, onboarded_at: new Date().toISOString() })
          .eq('id', bid),
      )

      // 3. Crew (+ invites)
      let invited = 0
      for (const [i, c] of crew.filter((c) => c.name.trim()).entries()) {
        const st = must(
          await supabase
            .from('staff')
            .insert({
              business_id: bid,
              name: c.name.trim(),
              phone: c.phone || null,
              email: c.email || null,
              role: c.role || 'Crew',
              colour: CREW_COLOURS[i % CREW_COLOURS.length],
            })
            .select('id')
            .single(),
        ) as { id: string }
        if (c.invite && c.email.trim()) {
          const inv = must(
            await supabase
              .from('invites')
              .insert({ business_id: bid, email: c.email.trim(), role: 'crew', staff_id: st.id, invited_by: user!.id })
              .select('id,token')
              .single(),
          ) as { id: string; token: string }
          await sendEmail('invite', inv.id, inviteLink(inv.token))
          invited++
        }
      }
      await reload()
      toast(invited ? `You're set up — ${invited} invite${invited > 1 ? 's' : ''} sent` : "You're all set up")
      navigate('/', { replace: true })
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <div style={{ background: 'var(--hero)', padding: '22px 16px 54px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div className="row">
            <BrandMark />
            <div className="brand-text" style={{ display: 'flex' }}>
              <b>Home Service Ops</b>
              <small>SET UP · STEP {step + 1} OF 4</small>
            </div>
          </div>
          <h1 style={{ color: '#fff', fontSize: 26, marginTop: 20 }}>{STEPS[step]}</h1>
          <p style={{ color: 'var(--on-navy)', fontWeight: 600, marginTop: 4 }}>
            {
              [
                'What kind of work do you do? We’ll load a starter price list.',
                'Tweak names and prices — all ex GST. You can change these any time.',
                'This appears on your quotes and invoices.',
                'Add the people who’ll be doing the jobs. Invite them to log in on their phone.',
              ][step]
            }
          </p>
          <div className="steps">
            {STEPS.map((s, i) => (
              <i key={s} className={i <= step ? 'on' : ''} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '-34px auto 0', padding: '0 16px 120px' }}>
        <div className="card rise" key={step} style={{ padding: 18 }}>
          {step === 0 && (
            <div className="trade-grid">
              {TRADES.map((t) => (
                <button key={t.key} className={`trade ${trade === t.key ? 'on' : ''}`} onClick={() => pickTrade(t.key)}>
                  <span className="emoji">{t.emoji}</span>
                  <b>{t.label}</b>
                  <small>{t.blurb}</small>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="stack">
              <div className="section-label">Services</div>
              {services.map((s, i) => (
                <div key={i} className="price-row with-freq">
                  <input
                    className="input"
                    value={s.name}
                    onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    aria-label="Service name"
                  />
                  <select
                    className="select"
                    value={s.frequency}
                    onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))}
                    aria-label="Frequency"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <MoneyInput value={s.price} onChange={(v) => setServices(services.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
                  <button className="line-x" onClick={() => setServices(services.filter((_, j) => j !== i))} aria-label="Remove">
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setServices([...services, { name: '', price: 0, frequency: 'One-off' }])}>
                <Icon name="plus" /> Add service
              </button>

              <div className="section-label" style={{ marginTop: 10 }}>
                Add-ons
              </div>
              {addons.map((a, i) => (
                <div key={i} className="price-row">
                  <input
                    className="input"
                    value={a.name}
                    onChange={(e) => setAddons(addons.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    aria-label="Add-on name"
                  />
                  <MoneyInput value={a.price} onChange={(v) => setAddons(addons.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
                  <button className="line-x" onClick={() => setAddons(addons.filter((_, j) => j !== i))} aria-label="Remove">
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAddons([...addons, { name: '', price: 0, for: [] }])}>
                <Icon name="plus" /> Add add-on
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="form-grid cols-2">
              <Field label="Business name" className="span-2">
                <input className="input" value={details.business_name} onChange={(e) => setDetails({ ...details, business_name: e.target.value })} />
              </Field>
              <Field label="ABN">
                <input className="input" inputMode="numeric" placeholder="12 345 678 901" value={details.abn} onChange={(e) => setDetails({ ...details, abn: e.target.value })} />
              </Field>
              <Field label="Business phone">
                <input className="input" inputMode="tel" placeholder="04xx xxx xxx" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
              </Field>
              <Field label="Business email" className="span-2">
                <input className="input" type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
              </Field>
              <Field label="Business address" className="span-2">
                <input className="input" placeholder="Street, suburb, state, postcode" value={details.address} onChange={(e) => setDetails({ ...details, address: e.target.value })} />
              </Field>
              <Field label="Your name">
                <input className="input" value={details.owner_name} onChange={(e) => setDetails({ ...details, owner_name: e.target.value })} />
              </Field>
              <Field label="Your mobile">
                <input className="input" inputMode="tel" value={details.owner_phone} onChange={(e) => setDetails({ ...details, owner_phone: e.target.value })} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="stack">
              {crew.length === 0 && <div className="note">Flying solo for now? Skip this — you can add crew later from the Crew tab.</div>}
              {crew.map((c, i) => (
                <div key={i} className="card" style={{ padding: 14, background: 'var(--blue-tint-2)' }}>
                  <div className="form-grid cols-2">
                    <Field label="Name">
                      <input className="input" value={c.name} onChange={(e) => setCrew(crew.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    </Field>
                    <Field label="Role">
                      <input className="input" value={c.role} onChange={(e) => setCrew(crew.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                    </Field>
                    <Field label="Mobile">
                      <input className="input" inputMode="tel" value={c.phone} onChange={(e) => setCrew(crew.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                    </Field>
                    <Field label="Email">
                      <input className="input" type="email" value={c.email} onChange={(e) => setCrew(crew.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                    </Field>
                  </div>
                  <div className="row-between" style={{ marginTop: 12 }}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={c.invite}
                        disabled={!c.email.trim()}
                        onChange={(e) => setCrew(crew.map((x, j) => (j === i ? { ...x, invite: e.target.checked } : x)))}
                      />
                      Email an invite to log in
                    </label>
                    <button className="link-btn" style={{ color: 'var(--red)' }} onClick={() => setCrew(crew.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button className="btn btn-soft" onClick={() => setCrew([...crew, { name: '', phone: '', email: '', role: 'Crew', invite: true }])}>
                <Icon name="plus" /> Add crew member
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255,255,255,.96)',
          borderTop: '1px solid var(--line)',
          padding: '12px 16px calc(14px + env(safe-area-inset-bottom))',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="row" style={{ maxWidth: 760, margin: '0 auto' }}>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </button>
          )}
          <div className="grow" />
          {step < 3 ? (
            <button className="btn btn-primary btn-lg" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continue
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" disabled={busy} onClick={finish}>
              {busy ? <Spinner /> : 'Finish set-up'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
