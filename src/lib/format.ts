const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const audWhole = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

/** $1,234.50 */
export const money = (n: number | null | undefined) => aud.format(Number(n) || 0)
/** $1,235 — for stat tiles */
export const moneyShort = (n: number | null | undefined) => audWhole.format(Number(n) || 0)

/** Local-date ISO (YYYY-MM-DD) without UTC drift. */
export function isoDate(d: Date = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Tue 23 Jul */
export function dateShort(s: string | null | undefined) {
  if (!s) return 'Unscheduled'
  const d = s.length <= 10 ? parseISODate(s) : new Date(s)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** 23/07/2026 */
export function dateNumeric(s: string | null | undefined) {
  if (!s) return '—'
  const d = s.length <= 10 ? parseISODate(s) : new Date(s)
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** 23 July 2026 */
export function dateLong(s: string | null | undefined) {
  if (!s) return '—'
  const d = s.length <= 10 ? parseISODate(s) : new Date(s)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "08:30:00" → { time: '8:30', ampm: 'am' } */
export function timeParts(t: string | null | undefined) {
  if (!t) return { time: '—', ampm: '' }
  const [hh, mm] = t.split(':').map(Number)
  const ampm = hh >= 12 ? 'pm' : 'am'
  const h = hh % 12 || 12
  return { time: `${h}:${String(mm).padStart(2, '0')}`, ampm }
}

export function timeLabel(t: string | null | undefined) {
  const p = timeParts(t)
  return p.ampm ? `${p.time}${p.ampm}` : ''
}

export function relTime(s: string) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`
  return dateShort(s)
}

/** 01:23:45 */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

export function hoursLabel(ms: number) {
  const h = ms / 3_600_000
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`
}

export function initials(name: string | null | undefined) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function firstName(name: string | null | undefined) {
  return (name || '').split(/\s+/)[0] || ''
}

export function greeting(d = new Date()) {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/** Formats an 11-digit ABN as 12 345 678 901. */
export function abn(s: string | null | undefined) {
  const d = (s || '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : s || ''
}

export const mapEmbedUrl = (address: string) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`
export const directionsUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
