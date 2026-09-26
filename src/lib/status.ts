import type { Duty, JobStatus, QuoteStatus } from './types'

export interface Tone {
  c: string
  bg: string
}

export const JOB_STATUS: Record<JobStatus, Tone> = {
  New: { c: '#5A7189', bg: '#EEF3F8' },
  'Quote Sent': { c: '#0C9BD6', bg: '#E2F6FD' },
  'Job Scheduled': { c: '#0C6FD0', bg: '#E7F1FB' },
  'In Progress': { c: '#D98A1F', bg: '#FBF1E1' },
  Done: { c: '#2C9E73', bg: '#E3F5EC' },
  Paid: { c: '#1C7F5B', bg: '#E1F1EA' },
  Cancelled: { c: '#C4453C', bg: '#FBEDEB' },
}

export const QUOTE_STATUS: Record<QuoteStatus, Tone> = {
  Draft: { c: '#5A7189', bg: '#EEF3F8' },
  Sent: { c: '#0C9BD6', bg: '#E2F6FD' },
  Accepted: { c: '#2C9E73', bg: '#E3F5EC' },
  Declined: { c: '#C4453C', bg: '#FBEDEB' },
}

export const DUTY: Record<Duty, Tone> = {
  Available: { c: '#2C9E73', bg: '#E3F5EC' },
  'On job': { c: '#D98A1F', bg: '#FBF1E1' },
  'Off today': { c: '#5A7189', bg: '#EEF3F8' },
}

export const PIPELINE: JobStatus[] = ['New', 'Quote Sent', 'Job Scheduled', 'In Progress', 'Done', 'Paid']
export const ACTIVE: JobStatus[] = ['Quote Sent', 'Job Scheduled', 'In Progress']

export const PIPE_LABEL: Record<JobStatus, string> = {
  New: 'New',
  'Quote Sent': 'Quote Sent',
  'Job Scheduled': 'Scheduled',
  'In Progress': 'In Progress',
  Done: 'Done',
  Paid: 'Paid',
  Cancelled: 'Cancelled',
}

/** What the primary action on a job moves it to. */
export function nextStatus(s: JobStatus): JobStatus | null {
  const i = PIPELINE.indexOf(s)
  if (i < 0 || i >= PIPELINE.length - 1) return null
  return PIPELINE[i + 1]
}

export const FREQUENCIES = ['One-off', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Six-monthly', 'Yearly']

export const CREW_COLOURS = ['#0C6FD0', '#35C6F4', '#075BAF', '#2C9E73', '#D98A1F', '#8B5CF6', '#C4453C', '#5A7189']

export const PAY_METHOD_LABEL = { cash: 'Cash', bank: 'Bank transfer', card: 'Card' } as const
export const PAY_METHODS = ['cash', 'bank', 'card'] as const

/** LC-1001 → INV-1001 */
export const invoiceNum = (jobNum: string) => `INV-${jobNum.replace(/^[A-Z]+-/, '')}`
