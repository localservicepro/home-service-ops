import { createHmac } from "node:crypto";
import { PLANS, type PlanKey } from "./plans";
import { toE164 } from "./phone";

// Server-only, no database or network: the Sales Brain wire format. Signing, the three event
// shapes, and how to react to each response. helpers/salesBrain.tsx does the I/O around these.
//
// Money is integer cents, AUD, GST included. Ids are this app's own ids as strings.

export const SALES_BRAIN_URL = "https://app.salesbrain.com.au/api/integrations/lsp-app";
export const MAX_BATCH = 500;

export type SbEventType = "account.upserted" | "payment.recorded" | "ticket.upserted";
export type SbEvent = { id: string; type: SbEventType; occurred_at: string; data: Record<string, unknown> };

// ---------- signing ----------

/** Hex HMAC-SHA256 of "<timestamp>.<raw body>". */
export function signPayload(secret: string, timestamp: string | number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Headers for one request. Sign the exact string you send (an empty string for the GET check). */
export function signedHeaders(secret: string, body: string, now = Date.now()): Record<string, string> {
  const ts = String(Math.floor(now / 1000));
  return {
    "Content-Type": "application/json",
    "x-lsp-timestamp": ts,
    "x-lsp-signature": `sha256=${signPayload(secret, ts, body)}`,
  };
}

/** Stringified once; that exact string is signed and sent. */
export const batchBody = (events: SbEvent[]) => JSON.stringify({ events });

// ---------- account.upserted ----------

export type AccountStatus = "trial" | "active" | "past_due" | "paused" | "cancelled";

export type AccountSource = {
  id: number;
  name: string;
  createdAt: Date;
  plan: string; // businesses.plan: "trial" until they subscribe, then "solo" | "team"
  comp: boolean;
  trialEndsAt: Date | null;
  subscriptionStatus: string | null; // Stripe: trialing | active | past_due | unpaid | paused | canceled | incomplete…
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
  cancelReason: string | null;
  lastActiveAt: Date | null;
  lastInvoiceCents: number | null;
  ownerName: string;
  email: string;
  phone: string;
  jobsLast30d: number;
  users: number;
};

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const planKey = (p: string): PlanKey | null => (p === "solo" || p === "team" ? p : null);

/** Monthly price with GST, in cents: the last regular charge when we have one, else list price + 10%. */
export const planMrrCents = (plan: PlanKey, lastInvoiceCents: number | null) =>
  lastInvoiceCents && lastInvoiceCents > 0 ? lastInvoiceCents : Math.round(PLANS[plan].price * 110);

/** The account as Sales Brain sees it right now. */
export function accountData(src: AccountSource, now = new Date()): Record<string, unknown> {
  const subscribed = planKey(src.plan);
  const trialLive = !!src.trialEndsAt && new Date(src.trialEndsAt).getTime() > now.getTime();
  const sub = src.subscriptionStatus;
  let status: AccountStatus;
  let plan: string;
  let mrr = 0;
  let cancelledAt: string | null = null;
  let cancelReason: string | null = src.cancelReason?.trim() || null;

  if (src.comp) {
    status = "active";
    plan = "Team (complimentary)";
  } else if (subscribed && (sub === "active" || sub === "past_due" || sub === "unpaid")) {
    status = sub === "active" ? "active" : "past_due";
    plan = PLANS[subscribed].name;
    mrr = planMrrCents(subscribed, src.lastInvoiceCents);
  } else if (subscribed && sub === "paused") {
    status = "paused";
    plan = PLANS[subscribed].name;
  } else if (subscribed && sub === "trialing") {
    status = "trial";
    plan = PLANS[subscribed].name;
  } else if (trialLive) {
    status = "trial";
    plan = subscribed ? PLANS[subscribed].name : "Team trial";
  } else {
    status = "cancelled";
    plan = subscribed ? PLANS[subscribed].name : "Trial";
    if (subscribed && sub) {
      // Had a subscription that ended.
      cancelledAt = iso(src.cancelledAt) ?? iso(src.trialEndsAt);
    } else {
      // Trial ran out without choosing a plan.
      cancelledAt = iso(src.cancelledAt) ?? iso(src.trialEndsAt);
      cancelReason = cancelReason ?? "Trial ended without choosing a plan";
    }
  }

  return {
    account_id: String(src.id),
    business_name: src.name,
    owner_name: src.ownerName || null,
    email: src.email || null,
    phone: toE164(src.phone || "") ?? (src.phone || null),
    plan,
    status,
    mrr_cents: mrr,
    currency: "aud",
    signed_up_at: iso(src.createdAt),
    cancelled_at: cancelledAt,
    cancel_reason: cancelReason,
    last_active_at: iso(src.lastActiveAt),
    usage: { jobs_last_30d: src.jobsLast30d, users: src.users },
  };
}

/** The fields whose change is worth telling Sales Brain about (usage and activity are sent daily). */
export function accountFingerprint(data: Record<string, unknown>): string {
  const keys = ["business_name", "owner_name", "email", "phone", "plan", "status", "mrr_cents", "cancelled_at", "cancel_reason"];
  return JSON.stringify(keys.map((k) => data[k] ?? null));
}

// ---------- payment.recorded ----------

export type StripeInvoiceLite = {
  id: string;
  amount_paid?: number;
  amount_due?: number;
  total?: number;
  currency?: string;
  billing_reason?: string | null;
  created: number;
  status_transitions?: { paid_at?: number | null } | null;
  lines?: { data?: { description?: string | null; period?: { start?: number } | null; price?: { lookup_key?: string | null } | null; pricing?: { price_details?: { price?: string } } }[] } | null;
};

const monthName = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-AU", { month: "long", timeZone: "Australia/Brisbane" });

function invoiceDescription(inv: StripeInvoiceLite) {
  const line = inv.lines?.data?.[0];
  const key = line?.price?.lookup_key;
  const plan = key === PLANS.team.lookupKey ? PLANS.team.name : key === PLANS.solo.lookupKey ? PLANS.solo.name : null;
  const month = monthName(line?.period?.start ?? inv.created);
  if (plan) return `${plan} plan, ${month}`;
  return line?.description?.trim() || `Home Service Ops, ${month}`;
}

/** A subscription invoice that was paid or failed. `at` is when it happened (the Stripe event time). */
export function paymentFromInvoice(accountId: number | string, inv: StripeInvoiceLite, outcome: "paid" | "failed", at?: number): Record<string, unknown> {
  const amount = outcome === "paid" ? inv.amount_paid ?? inv.total ?? 0 : inv.amount_due ?? inv.total ?? 0;
  const when = outcome === "paid" ? inv.status_transitions?.paid_at ?? at ?? inv.created : at ?? inv.created;
  return {
    account_id: String(accountId),
    payment_id: inv.id,
    amount_cents: Math.abs(Math.round(amount)),
    currency: (inv.currency || "aud").toLowerCase(),
    status: outcome,
    kind: (inv.billing_reason ?? "").startsWith("subscription") ? "subscription" : "one_off",
    description: invoiceDescription(inv),
    paid_at: new Date(when * 1000).toISOString(),
  };
}

export type StripeRefundLite = { id: string; amount: number; currency?: string; created: number; charge?: string | { id: string } | null };

/** A refund (positive amount, status refunded). */
export function paymentFromRefund(accountId: number | string, r: StripeRefundLite): Record<string, unknown> {
  const charge = typeof r.charge === "string" ? r.charge : r.charge?.id;
  return {
    account_id: String(accountId),
    payment_id: r.id,
    amount_cents: Math.abs(Math.round(r.amount)),
    currency: (r.currency || "aud").toLowerCase(),
    status: "refunded",
    kind: "refund",
    description: charge ? `Refund of ${charge}` : "Refund",
    paid_at: new Date(r.created * 1000).toISOString(),
  };
}

// ---------- ticket.upserted ----------

export type TicketSource = {
  id: number;
  businessId: number;
  subject: string;
  body: string;
  status: string;
  priority: string;
  category: string;
  lastMessage: string | null;
  openedAt: Date;
  updatedAt: Date;
  solvedAt: Date | null;
};

export function ticketData(t: TicketSource): Record<string, unknown> {
  return {
    account_id: String(t.businessId),
    ticket_id: String(t.id),
    subject: t.subject,
    body: t.body,
    status: t.status,
    priority: t.priority,
    category: t.category,
    last_message: t.lastMessage,
    opened_at: iso(t.openedAt),
    updated_at: iso(t.updatedAt),
    solved_at: iso(t.solvedAt),
  };
}

// ---------- responses and retries ----------

/** Waits after the 1st, 2nd, 3rd and 4th failed attempt; after that keep trying every 2h. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000];
/** The failure count at which someone is emailed (once). */
export const ALERT_AFTER = BACKOFF_MS.length + 1;

export function retryDelayMs(failures: number): number {
  return BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1];
}

export type SendOutcome =
  | { kind: "done"; sent: string[]; rejected: { id: string; error: string }[] } // 200 / 207
  | { kind: "split"; error: string } // 400 on a batch: send each event alone to find the bad one
  | { kind: "reject"; error: string } // 400 on a single event: don't resend until fixed
  | { kind: "hold"; error: string } // 401 and other set-up errors: stop until someone fixes it
  | { kind: "retry"; error: string }; // 503, 5xx, network: back off

const errorText = (body: unknown, fallback: string) => {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown };
    if (typeof b.error === "string" && b.error) return b.error;
    if (typeof b.message === "string" && b.message) return b.message;
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 300);
  return fallback;
};

/** What to do with a batch after Sales Brain answers (status null = it never answered). */
export function classifyResponse(status: number | null, body: unknown, ids: string[], networkError?: string): SendOutcome {
  if (status === null) return { kind: "retry", error: networkError || "Couldn't reach Sales Brain" };
  if (status === 200 || status === 207) {
    const errs = (body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors) ? (body as { errors: unknown[] }).errors : []) as {
      id?: unknown;
      error?: unknown;
    }[];
    const rejected = errs
      .filter((e) => typeof e?.id === "string" && ids.includes(e.id))
      .map((e) => ({ id: String(e.id), error: typeof e.error === "string" ? e.error : "Rejected by Sales Brain" }));
    // A 207 that names no event we sent: nothing to pin it on, so treat the batch as delivered.
    const bad = new Set(rejected.map((r) => r.id));
    return { kind: "done", sent: ids.filter((id) => !bad.has(id)), rejected };
  }
  if (status === 400) {
    const error = `400 ${errorText(body, "Bad request")}`;
    return ids.length > 1 ? { kind: "split", error } : { kind: "reject", error };
  }
  if (status === 401) return { kind: "hold", error: `401 ${errorText(body, "Signature or timestamp rejected")}` };
  if (status === 408 || status === 429 || status >= 500) return { kind: "retry", error: `${status} ${errorText(body, "Sales Brain unavailable")}` };
  return { kind: "hold", error: `${status} ${errorText(body, "Unexpected response")}` };
}
