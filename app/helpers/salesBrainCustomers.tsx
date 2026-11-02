import type { Job, Quote, StaffMember } from "../endpoints/ops/snapshot_GET.schema";
import { computeDashboard, type DashRange, type DashboardStats } from "./dashboardStats";
import { ACCESS_LABEL, type AdminCustomer, type AdminCustomerDetail } from "./adminShared";
import { categoryLabel, type TicketDetail, type TicketSummary } from "./supportShared";

// Server-only, no I/O: what Sales Brain reads about each customer (GET /api/integrations/sales-brain/
// customers, /customer and /tickets). Account status comes from the staff admin's rules
// (adminData), the business numbers from the customer's own dashboard maths (dashboardStats), so
// Jarvis reports what we and the customer see. Money is integer cents, AUD; job and quote prices
// are as the business set them (GST included when they charge it).

export const RANGES: DashRange[] = ["month", "quarter", "fy"];

const cents = (dollars: number) => Math.round((dollars || 0) * 100);
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/**
 * A timestamp moved so the local clock reads Brisbane time (UTC+10, no daylight saving): the
 * dashboard maths buckets by the local calendar day, as it does in the customer's browser.
 */
export function brisbaneWall(d: Date | string) {
  const t = new Date(d);
  return new Date(t.getTime() + 10 * 3_600_000 + t.getTimezoneOffset() * 60_000);
}
/** Today's date in Brisbane, YYYY-MM-DD. */
export const brisbaneToday = (now = Date.now()) => new Date(now + 10 * 3_600_000).toISOString().slice(0, 10);

export type OpsRows = {
  jobs: { businessId: number; status: Job["status"]; price: number; scheduledDate: string | null; statusChangedAt: Date; createdAt: Date; payMethod: Job["payMethod"]; payProvider: string | null; service: string; staffId: number | null; source: string }[];
  quotes: { businessId: number; status: Quote["status"]; price: number; sentAt: Date | null; statusChangedAt: Date; createdAt: Date }[];
  staff: { businessId: number; id: number; name: string; color: string }[];
};

/** The customer's own dashboard numbers for one business. */
export function businessStats(rows: OpsRows, businessId: number, range: DashRange, now = Date.now()): DashboardStats {
  const jobs = rows.jobs
    .filter((j) => j.businessId === businessId)
    .map((j) => ({ ...j, statusChangedAt: brisbaneWall(j.statusChangedAt), createdAt: brisbaneWall(j.createdAt) }) as unknown as Job);
  const quotes = rows.quotes
    .filter((q) => q.businessId === businessId)
    .map((q) => ({ ...q, sentAt: q.sentAt ? brisbaneWall(q.sentAt) : null, statusChangedAt: brisbaneWall(q.statusChangedAt), createdAt: brisbaneWall(q.createdAt) }) as unknown as Quote);
  const staff = rows.staff.filter((s) => s.businessId === businessId) as unknown as StaffMember[];
  return computeDashboard({ jobs, quotes, staff }, range, brisbaneToday(now));
}

/** The dashboard as Sales Brain reads it. */
export function analytics(s: DashboardStats) {
  return {
    range: s.range,
    period: s.rangeLabel,
    collected_cents: cents(s.collected),
    collected_previous_period_cents: cents(s.collectedPrev),
    payments_collected: s.collectedCount,
    jobs_completed: s.completedCount,
    jobs_completed_previous_period: s.completedPrevCount,
    completed_value_cents: cents(s.completedValue),
    average_job_cents: cents(s.avgJob),
    outstanding_cents: cents(s.outstanding),
    unpaid_jobs: s.owed.length,
    overdue_cents: cents(s.overdueValue),
    overdue_jobs: s.overdueCount,
    booked_ahead_cents: cents(s.bookedAhead),
    booked_ahead_jobs: s.bookedAheadCount,
    booked_this_week_cents: cents(s.bookedWeek),
    open_quotes: s.openQuotesCount,
    open_quotes_cents: cents(s.openQuotesValue),
    quotes_sent: s.quotesSent,
    quotes_decided: s.decidedCount,
    quotes_won: s.wonCount,
    ...(s.winRate === null ? {} : { quote_win_rate_pct: Math.round(s.winRate * 1000) / 10 }),
    payment_methods: s.payMix.map((m) => ({ method: m.label, cents: cents(m.value) })),
    top_services: s.services.map((x) => ({ service: x.label, cents: cents(x.value), jobs: x.count ?? 0 })),
    lead_sources: s.sources.map((x) => ({ source: x.label, cents: cents(x.value), leads: x.count ?? 0 })),
    crew: s.crew.map((c) => ({ name: c.name, jobs_completed: c.jobs, cents: cents(c.value) })),
    pipeline: s.pipeline.map((p) => ({ status: p.label, jobs: p.count, cents: cents(p.value) })),
  };
}

/** The account as our staff admin shows it. */
export function account(c: AdminCustomer) {
  return {
    account_id: String(c.id),
    business_name: c.name,
    owner_name: c.ownerName || null,
    email: c.email || null,
    phone: c.phone || null,
    trade: c.trade || null,
    access: c.access,
    access_label: ACCESS_LABEL[c.access],
    status: c.status,
    plan: c.plan,
    mrr_cents: c.mrrCents,
    signed_up_at: iso(c.signedUpAt),
    last_active_at: iso(c.lastActiveAt),
    trial_ends_at: iso(c.trialEndsAt),
    cancelled_at: iso(c.cancelledAt),
    cancel_reason: c.cancelReason,
    included_with_sales_brain: c.access === "included",
    users: c.users,
    jobs_last_30_days: c.jobs30d,
    open_tickets: c.openTickets,
    demo: c.demo,
  };
}

export function ticket(t: TicketSummary, now = Date.now()) {
  return {
    ticket_id: String(t.id),
    account_id: String(t.businessId),
    ...(t.businessName ? { business: t.businessName } : {}),
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    topic: categoryLabel(t.category),
    assigned_to: t.assigneeName ?? null,
    last_message: t.lastMessage,
    opened_at: iso(t.openedAt),
    updated_at: iso(t.updatedAt),
    solved_at: iso(t.solvedAt),
    first_reply_at: iso(t.firstResponseAt ?? null),
    ...(t.status === "solved" || t.status === "closed" ? {} : { waiting_hours: Math.round(((now - new Date(t.updatedAt).getTime()) / 3_600_000) * 10) / 10 }),
  };
}

export function ticketWithMessages(t: TicketDetail, now = Date.now()) {
  return {
    ...ticket(t, now),
    body: t.body,
    created_by_email: t.createdByEmail,
    messages: t.messages.map((m) => ({ from: m.fromStaff ? "staff" : "customer", author: m.authorName, internal_note: !!m.internal, body: m.body, at: iso(m.createdAt) })),
  };
}

/** Everything about one customer: account, billing, team, usage, the business numbers and their tickets. */
export function customerProfile(d: AdminCustomerDetail, stats: DashboardStats, now = Date.now()) {
  return {
    account: {
      ...account(d),
      onboarded_at: iso(d.onboardedAt),
      suspended_at: iso(d.suspendedAt),
      suspended_reason: d.suspendedReason,
      details: d.details,
    },
    billing: {
      subscribed_plan: d.billing.subscribedPlan,
      subscription_status: d.billing.subscriptionStatus,
      current_period_end: iso(d.billing.currentPeriodEnd),
      cancel_at_period_end: d.billing.cancelAtPeriodEnd,
      free_access: d.billing.comp,
      free_access_source: d.billing.compSource,
      free_access_ends_at: iso(d.billing.compEndsAt),
      sales_brain_plan: d.billing.salesBrainPlan,
      last_invoice_cents: d.billing.lastInvoiceCents,
      lifetime_cents: d.billing.lifetimeCents,
      payments: d.payments.map((p) => ({ payment_id: p.id, amount_cents: p.amountCents, status: p.status, kind: p.kind, description: p.description, paid_at: iso(p.paidAt) })),
    },
    team: d.members.map((m) => ({ name: m.name, email: m.email, role: m.role, joined_at: iso(m.joinedAt) })),
    pending_invites: d.invites.map((i) => ({ email: i.email, role: i.role, sent_at: iso(i.sentAt) })),
    usage: { clients: d.usage.clients, quotes: d.usage.quotes, jobs: d.usage.jobs, jobs_last_30_days: d.usage.jobs30d, last_job_at: iso(d.usage.lastJobAt) },
    analytics: analytics(stats),
    tickets: d.tickets.map((t) => ticket(t, now)),
  };
}

/** ?range=month|quarter|fy (default month). */
export function parseRange(url: URL): DashRange | { error: string } {
  const r = (url.searchParams.get("range") ?? "month").trim().toLowerCase() as DashRange;
  return RANGES.includes(r) ? r : { error: "range must be month, quarter or fy" };
}
export const wantsDemo = (url: URL) => ["1", "true", "yes"].includes((url.searchParams.get("include_demo") ?? "").trim().toLowerCase());
