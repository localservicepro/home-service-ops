import { useMemo, useState } from 'react'
import { money, uid } from '../lib/format'
import type { Addon, LineItem, Service } from '../lib/types'
import { Field, MoneyInput, Sheet } from './ui'
import { Icon } from './Icon'

/**
 * Pick services + their linked add-ons into line items, and edit qty/price inline.
 * Used by the quote builder, the new-job form and "add extras" on a job.
 */
export function LineBuilder({
  items,
  onChange,
  services,
  addons,
}: {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  services: Service[]
  addons: Addon[]
}) {
  const [custom, setCustom] = useState(false)
  const activeServices = services.filter((s) => s.active)
  const chosenServiceIds = items.filter((i) => i.kind === 'service' && i.ref_id).map((i) => i.ref_id as string)

  const suggestedAddons = useMemo(
    () =>
      addons.filter(
        (a) => a.active && (a.service_ids.length === 0 || a.service_ids.some((id) => chosenServiceIds.includes(id))),
      ),
    [addons, chosenServiceIds],
  )

  const has = (refId: string) => items.some((i) => i.ref_id === refId)

  const toggleService = (s: Service) => {
    if (has(s.id)) {
      onChange(items.filter((i) => i.ref_id !== s.id))
    } else {
      onChange([...items, { id: uid(), name: s.name, qty: 1, unit_price: Number(s.price), kind: 'service', ref_id: s.id }])
    }
  }
  const toggleAddon = (a: Addon) => {
    if (has(a.id)) onChange(items.filter((i) => i.ref_id !== a.id))
    else onChange([...items, { id: uid(), name: a.name, qty: 1, unit_price: Number(a.price), kind: 'addon', ref_id: a.id }])
  }
  const patch = (id: string, p: Partial<LineItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)))

  return (
    <div className="stack">
      <div>
        <div className="section-label" style={{ marginBottom: 8 }}>
          Services
        </div>
        {activeServices.length === 0 && <div className="note">No services yet — add them in Settings → Services, or add a custom line.</div>}
        <div className="seg wrap" style={{ overflow: 'visible' }}>
          {activeServices.map((s) => (
            <button key={s.id} type="button" className={`chip soft ${has(s.id) ? 'on' : ''}`} onClick={() => toggleService(s)}>
              {has(s.id) && <Icon name="check" size={14} />}
              {s.name} <span className="count">{money(s.price)}</span>
            </button>
          ))}
        </div>
      </div>
      {suggestedAddons.length > 0 && (
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            Add-ons
          </div>
          <div className="seg wrap" style={{ overflow: 'visible' }}>
            {suggestedAddons.map((a) => (
              <button key={a.id} type="button" className={`chip soft ${has(a.id) ? 'on' : ''}`} onClick={() => toggleAddon(a)}>
                {has(a.id) ? <Icon name="check" size={14} /> : '+'} {a.name} <span className="count">{money(a.price)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="stack-sm">
          <div className="section-label">Lines</div>
          {items.map((l) => (
            <div key={l.id} className="card" style={{ padding: 12 }}>
              <div className="row">
                <input className="input grow" value={l.name} onChange={(e) => patch(l.id, { name: e.target.value })} aria-label="Line description" />
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => onChange(items.filter((i) => i.id !== l.id))} aria-label="Remove line">
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <label className="field" style={{ width: 90 }}>
                  <span>Qty</span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => patch(l.id, { qty: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                  />
                </label>
                <label className="field grow">
                  <span>Unit price (ex GST)</span>
                  <MoneyInput value={l.unit_price} onChange={(v) => patch(l.id, { unit_price: v })} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-soft" onClick={() => setCustom(true)}>
        <Icon name="plus" /> Custom line
      </button>
      {custom && (
        <ExtraSheet
          title="Custom line"
          onClose={() => setCustom(false)}
          onAdd={(li) => {
            onChange([...items, { ...li, kind: items.length ? li.kind : 'service' }])
            setCustom(false)
          }}
        />
      )}
    </div>
  )
}

/** Quick "add extra" sheet: name, qty, unit price. */
export function ExtraSheet({
  title = 'Add extra',
  onClose,
  onAdd,
  addons = [],
}: {
  title?: string
  onClose: () => void
  onAdd: (li: LineItem) => void
  addons?: Addon[]
}) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(0)
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary btn-block"
          disabled={!name.trim()}
          onClick={() => onAdd({ id: uid(), name: name.trim(), qty, unit_price: price, kind: 'extra' })}
        >
          Add line
        </button>
      }
    >
      <div className="stack">
        {addons.filter((a) => a.active).length > 0 && (
          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              From your add-ons
            </div>
            <div className="seg wrap" style={{ overflow: 'visible' }}>
              {addons
                .filter((a) => a.active)
                .map((a) => (
                  <button
                    key={a.id}
                    className="chip soft"
                    onClick={() => onAdd({ id: uid(), name: a.name, qty: 1, unit_price: Number(a.price), kind: 'addon', ref_id: a.id })}
                  >
                    + {a.name} <span className="count">{money(a.price)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
        <Field label="Description">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Extra green waste bags" autoFocus />
        </Field>
        <div className="row">
          <Field label="Qty" className="">
            <input className="input num" style={{ width: 90 }} inputMode="decimal" value={qty} onChange={(e) => setQty(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} />
          </Field>
          <Field label="Unit price (ex GST)" className="grow">
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
        </div>
      </div>
    </Sheet>
  )
}
