// Shared by the browser and the api: the staff admin's data.
import type { TicketSummary } from "./supportShared";

/** How a customer has access: paying, on a trial, free (staff), included with Sales Brain, behind on payment, suspended, or none. */
export type CustomerAccess = "paying" | "trial" | "free" | "included" | "past_due" | "paused" | "suspended" | "none";

export const ACCESS_LABEL: Record<CustomerAccess, string> = {
  paying: "Paying",
  trial: "Trial",
  free: "Free (staff)",
  included: "Included with Sales Brain",
  past_due: "Payment overdue",
  paused: "Paused",
  suspended: "Suspended",
  none: "Not subscribed",
};

export type AdminCustomer = {
  id: number;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  status: string; // trial | active | past_due | paused | cancelled (as sent to Sales Brain)
  access: CustomerAccess;
  plan: string;
  trade: string;
  mrrCents: number;
  signedUpAt: Date;
  lastActiveAt: Date | null;
  trialEndsAt: Date | null;
  cancelledAt: Date | null;
  jobs30d: number;
  users: number;
  openTickets: number;
  salesBrain: boolean;
  cancelReason: string | null;
  demo: boolean;
};

export type AdminPayment = {
  id: string;
  businessId: number;
  businessName: string;
  amountCents: number;
  status: string; // paid | failed | refunded
  kind: string; // subscription | one_off | refund
  description: string;
  paidAt: Date;
};

export type AdminCustomerDetail = AdminCustomer & {
  onboardedAt: Date | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  details: { abn: string; phone: string; email: string; address: string; website: string; area: string };
  billing: {
    subscribedPlan: string;
    subscriptionStatus: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    comp: boolean;
    compSource: string | null;
    compNote: string | null;
    compEndsAt: Date | null;
    salesBrainCustomerId: string | null;
    salesBrainPlan: string | null;
    lastInvoiceCents: number | null;
    lifetimeCents: number;
  };
  payments: AdminPayment[];
  members: { id: number; name: string; email: string; role: string; joinedAt: Date | null }[];
  invites: { id: number; email: string; role: string; sentAt: Date; expiresAt: Date }[];
  usage: { clients: number; quotes: number; jobs: number; jobs30d: number; lastJobAt: Date | null };
  tickets: TicketSummary[];
  notes: { id: number; body: string; createdAt: Date; authorName: string }[];
};

export type Point = { at: Date; value: number };

export type AdminOverview = {
  demo: boolean;
  kpis: {
    mrrCents: number;
    arpaCents: number;
    paying: number;
    revenueMtdCents: number;
    revenuePrevMtdCents: number; // last month, same number of days
    withAccess: number; // paying, overdue, trial, included or free
    withAccessPrev: number; // the same 30 days ago
    signups30: number;
    signupsPrev30: number;
    churned30: number;
    churnedPrev30: number;
    active7: number;
    jobs30: number;
    jobsPrev30: number;
  };
  revenueMonthly: { at: Date; paidCents: number; refundedCents: number; failedCents: number; payments: number }[];
  revenueDaily: Point[];
  signups: { daily: Point[]; weekly: Point[]; monthly: Point[] };
  mix: { access: CustomerAccess; count: number }[];
  plans: { name: string; count: number; mrrCents: number }[];
  trades: { trade: string; count: number }[];
  activity: { today: number; week: number; month: number; dormant: number };
  payments: AdminPayment[];
  paymentHealth: { failed30: number; failedCents30: number; refundedCents30: number; lifetimeCents: number };
  cancelReasons: { reason: string; count: number }[];
  trialsEnding: AdminCustomer[];
  pastDueList: AdminCustomer[];
  recentSignups: AdminCustomer[];
  recentlyCancelled: AdminCustomer[];
  support: { open: number; pending: number; urgent: number; unassigned: number; solved30: number; avgFirstResponseHours: number | null };
  recentTickets: TicketSummary[];
};

export type SupportOverview = {
  open: number;
  pending: number;
  urgent: number;
  unassigned: number;
  created7: number;
  createdPrev7: number;
  solved7: number;
  solved30: number;
  avgFirstReplyHours: number | null;
  avgResolveHours: number | null;
  daily: { at: Date; created: number; solved: number }[];
  byCategory: { category: string; open: number; total30: number }[];
  byPriority: { priority: string; count: number }[];
  staff: { id: number; name: string; open: number; solved30: number }[];
  oldest: TicketSummary[];
};

export const TRADE_LABEL: Record<string, string> = {
  lawn: "Lawn & garden",
  cleaning: "Cleaning",
  pressure: "Pressure washing",
  pest: "Pest control",
  handyman: "Handyman",
  pool: "Pool & spa",
  other: "Other",
};

export const aud = (cents: number, opts: { compact?: boolean } = {}) =>
  opts.compact && Math.abs(cents) >= 1_000_00
    ? `$${(cents / 100_000).toLocaleString("en-AU", { maximumFractionDigits: 1 })}k`
    : (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** Percent change, or null when there's nothing to compare with. */
export const pctChange = (now: number, prev: number) => (prev > 0 ? ((now - prev) / prev) * 100 : now > 0 ? null : 0);
