import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { initials as toInitials } from '../lib/format'
import { DUTY, JOB_STATUS, QUOTE_STATUS } from '../lib/status'
import type { Duty, JobStatus, QuoteStatus } from '../lib/types'
import { Icon } from './Icon'

// ── Pills ──
export function Pill({ c, bg, children, dot }: { c: string; bg: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`pill${dot ? ' pill-dot' : ''}`} style={{ color: c, background: bg }}>
      {children}
    </span>
  )
}
export const StatusPill = ({ status }: { status: JobStatus }) => <Pill {...JOB_STATUS[status]}>{status}</Pill>
export const QuotePill = ({ status }: { status: QuoteStatus }) => <Pill {...QUOTE_STATUS[status]}>{status}</Pill>
export const DutyPill = ({ duty }: { duty: Duty }) => (
  <Pill {...DUTY[duty]} dot>
    {duty}
  </Pill>
)

// ── Avatar ──
export function Avatar({ name, colour, size }: { name?: string | null; colour?: string | null; size?: 'lg' | 'xl' }) {
  if (!name) return <span className={`avatar empty ${size || ''}`}>?</span>
  return (
    <span className={`avatar ${size || ''}`} style={{ background: colour || undefined }}>
      {toInitials(name)}
    </span>
  )
}

// ── Loading / empty ──
export const Spinner = () => <span className="spinner" role="status" aria-label="Loading" />
export const LoadingPage = () => (
  <div className="loading-page">
    <Spinner />
  </div>
)
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

// ── Form bits ──
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className || ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </label>
  )
}

export function MoneyInput({ value, onChange, placeholder }: { value: number | string; onChange: (v: number) => void; placeholder?: string }) {
  const [text, setText] = useState(String(value ?? ''))
  useEffect(() => {
    if (Number(text) !== Number(value)) setText(String(value ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="input-prefix">
      <b>$</b>
      <input
        className="input num"
        inputMode="decimal"
        value={text}
        placeholder={placeholder || '0.00'}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9.]/g, '')
          setText(t)
          onChange(Number(t) || 0)
        }}
      />
    </div>
  )
}

// ── Sheet: bottom sheet on phone, centred dialog ≥768px ──
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  )
}

export function Confirm({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  body: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost grow" onClick={onClose}>
            Keep
          </button>
          <button
            className={`btn grow ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{body}</div>
    </Sheet>
  )
}

// ── Toasts ──
interface ToastMsg {
  id: number
  text: string
  err?: boolean
}
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null)
  const show = useCallback((text: string, err?: boolean) => setMsg({ id: Date.now(), text, err }), [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3200)
    return () => clearTimeout(t)
  }, [msg])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div key={msg.id} className={`toast${msg.err ? ' err' : ''}`} role="status">
          {!msg.err && <Icon name="check" size={16} style={{ color: '#35C6F4' }} />}
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/** Wraps an async action with busy state + error toast. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setBusy(true)
      try {
        await fn()
        if (ok) toast(ok)
        return true
      } catch (e) {
        toast((e as Error).message || 'Something went wrong', true)
        return false
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )
  return { busy, run }
}
