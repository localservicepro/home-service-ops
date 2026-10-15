import type { Enums, Tables } from './database.types'

// Enums come straight from the database schema (src/lib/database.types.ts).
export type Role = Enums<'member_role'>
export type JobStatus = Enums<'job_status'>
export type QuoteStatus = Enums<'quote_status'>
export type WorkState = Enums<'work_state'>
export type PayState = Enums<'pay_state'>
export type PayMethod = Enums<'pay_method'>
export type RateType = Enums<'rate_type'>
export type Duty = Enums<'duty_status'>

export interface Business {
  id: string
  name: string
  trade: string | null
  plan: string
  trial_ends_at: string
  onboarded_at: string | null
  created_at: string
}

export interface Membership {
  id: string
  user_id: string
  business_id: string
  role: Role
  staff_id: string | null
  created_at: string
  businesses?: Business
}

export interface Invite {
  id: string
  business_id: string
  email: string
  role: Exclude<Role, 'owner'>
  staff_id: string | null
  token: string
  expires_at: string
  accepted_at: string | null
  sent_at: string | null
  created_at: string
}

export interface Settings {
  business_id: string
  business_name: string | null
  abn: string | null
  phone: string | null
  email: string | null
  address: string | null
  logo_url: string | null
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  payment_methods: PayMethod[]
  bank_account_name: string | null
  bank_bsb: string | null
  bank_account_number: string | null
  payment_terms_days: number
  online_payment_url: string | null
  integrations: Record<string, boolean>
}

export interface Staff {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  role: string
  colour: string
  pay_rate: number
  rate_type: RateType
  duty: Duty
  active: boolean
  created_at: string
}

export interface Address {
  label?: string
  line: string
}

export interface Client {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  addresses: Address[]
  notes: string | null
  created_at: string
}

export interface Service {
  id: string
  business_id: string
  name: string
  price: number
  frequency: string
  active: boolean
  sort: number
}

export interface Addon {
  id: string
  business_id: string
  name: string
  price: number
  service_ids: string[]
  active: boolean
}

export type LineKind = 'service' | 'addon' | 'extra'

export interface LineItem {
  id: string
  name: string
  qty: number
  unit_price: number
  kind: LineKind
  ref_id?: string | null
}

export interface Photo {
  path: string
  kind: 'before' | 'after'
  uploaded_at: string
}

export interface Job {
  id: string
  business_id: string
  num: string
  status: JobStatus
  customer: string
  phone: string | null
  email: string | null
  address: string | null
  service: string | null
  line_items: LineItem[]
  price: number
  gst: boolean
  discount: number
  scheduled_date: string | null
  scheduled_time: string | null
  frequency: string
  staff_id: string | null
  client_id: string | null
  notes: string | null
  photos: Photo[]
  work_state: WorkState
  work_started_at: string | null
  work_elapsed_ms: number
  pay_state: PayState
  pay_method: PayMethod | null
  paid_at: string | null
  amount_paid: number
  public_token: string
  invoice_sent_at: string | null
  source: string
  quote_id: string | null
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  business_id: string
  num: string
  status: QuoteStatus
  customer: string
  phone: string | null
  email: string | null
  address: string | null
  client_id: string | null
  line_items: LineItem[]
  price: number
  gst: boolean
  discount: number
  note: string | null
  valid_until: string | null
  public_token: string
  sent_at: string | null
  viewed_at: string | null
  responded_at: string | null
  decline_reason: string | null
  response_notified_at: string | null
  request_job_id: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  business_id: string
  job_id: string
  amount: number
  method: PayMethod
  paid_at: string
  note: string | null
  recorded_by: string | null
  created_at: string
}

export interface Activity {
  id: string
  business_id: string
  kind: string
  message: string
  job_id: string | null
  quote_id: string | null
  created_at: string
}

export interface PublicBusiness {
  name: string
  abn: string | null
  phone: string | null
  email: string | null
  address: string | null
  logo_url: string | null
  payment_methods: PayMethod[] | null
  bank_account_name: string | null
  bank_bsb: string | null
  bank_account_number: string | null
  payment_terms_days: number | null
  online_payment_url: string | null
}

// ── Schema drift check ──────────────────────────────────────
// Fails to compile if a table gains/loses a column that the matching interface doesn't mirror.
type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never] ? true : [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>]
type Expect<T extends true> = T
export type SchemaChecks = [
  Expect<SameKeys<Tables<'jobs'>, Job>>,
  Expect<SameKeys<Tables<'quotes'>, Quote>>,
  Expect<SameKeys<Tables<'payments'>, Payment>>,
  Expect<SameKeys<Tables<'staff'>, Staff>>,
  Expect<SameKeys<Tables<'clients'>, Client>>,
  Expect<SameKeys<Tables<'services'>, Omit<Service, never> & { created_at: string }>>,
  Expect<SameKeys<Tables<'addons'>, Addon & { created_at: string }>>,
  Expect<SameKeys<Tables<'settings'>, Settings & { updated_at: string }>>,
  Expect<SameKeys<Tables<'activity'>, Activity>>,
  Expect<SameKeys<Tables<'invites'>, Invite & { invited_by: string | null; accepted_by: string | null }>>,
  Expect<SameKeys<Tables<'businesses'>, Business & { next_job_num: number; next_quote_num: number; created_by: string | null }>>,
]
