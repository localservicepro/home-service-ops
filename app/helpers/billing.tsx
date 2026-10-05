import { sql } from "kysely";
import { db } from "./db";
import { stripeApi, isStripeConfigured } from "./stripeConnect";
import { PLANS, type BillingStatus, type BillingSummary, type PlanKey } from "./plans";
import { API_URL } from "./serverEnv";

// Server-only. Subscriptions for businesses using the app, billed on the LSP platform
// Stripe account, plus the plan limits the app enforces.

export class PaymentRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

const ACTIVE_SUB = ["active", "trialing", "past_due"];
const SYNC_EVERY_MS = 10 * 60 * 1000;

function monthRange(isoDate: string) {
  const [y, m] = isoDate.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${y}-${pad(m)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { start, next };
}
export const todayIso = () => new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10); // AEST-ish calendar day

export async function countJobsInMonth(businessId: number, isoDate: string, excludeJobId?: number) {
  const { start, next } = monthRange(isoDate);
  let q = db
    .selectFrom("jobs")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("businessId", "=", businessId)
    .where("scheduledDate", ">=", sql<Date>`${start}::date`)
    .where("scheduledDate", "<", sql<Date>`${next}::date`)
    .where("status", "!=", "Cancelled");
  if (excludeJobId) q = q.where("id", "!=", excludeJobId);
  return Number((await q.executeTakeFirstOrThrow()).n);
}

export async function getBilling(businessId: number): Promise<BillingSummary> {
  let b = await db.selectFrom("businesses").selectAll().where("id", "=", businessId).executeTakeFirstOrThrow();
  // Keep subscription state fresh even without webhooks.
  if (b.stripeCustomerId && isStripeConfigured() && (!b.billingSyncedAt || Date.now() - b.billingSyncedAt.getTime() > SYNC_EVERY_MS)) {
    await syncSubscription(businessId).catch((e) => console.error("Billing sync failed", e instanceof Error ? e.message : e));
    b = await db.selectFrom("businesses").selectAll().where("id", "=", businessId).executeTakeFirstOrThrow();
  }
  const subscribedPlan: PlanKey | null = b.plan === "solo" || b.plan === "team" ? b.plan : null;
  const trialLive = !!b.trialEndsAt && b.trialEndsAt.getTime() > Date.now();
  let status: BillingStatus;
  let plan: PlanKey;
  if (b.comp) {
    status = "comp";
    plan = "team";
  } else if (subscribedPlan && b.subscriptionStatus && ACTIVE_SUB.includes(b.subscriptionStatus)) {
    status = b.subscriptionStatus === "past_due" ? "past_due" : "active";
    plan = subscribedPlan;
  } else if (trialLive) {
    status = "trial";
    plan = "team";
  } else {
    status = "expired";
    plan = subscribedPlan ?? "solo";
  }
  const [jobs, seats] = await Promise.all([
    countJobsInMonth(businessId, todayIso()),
    db
      .selectFrom("memberships")
      .select(["role"])
      .where("businessId", "=", businessId)
      .unionAll(
        db
          .selectFrom("invites")
          .select(["role"])
          .where("businessId", "=", businessId)
          .where("acceptedAt", "is", null)
          .where("expiresAt", ">", new Date()),
      )
      .execute(),
  ]);
  return {
    plan,
    status,
    subscribedPlan,
    trialEndsAt: b.trialEndsAt,
    currentPeriodEnd: b.currentPeriodEnd,
    cancelAtPeriodEnd: b.cancelAtPeriodEnd,
    readOnly: status === "expired",
    jobsThisMonth: jobs,
    jobLimit: PLANS[plan].jobsPerMonth,
    officeUsed: seats.filter((s) => s.role !== "crew").length,
    crewUsed: seats.filter((s) => s.role === "crew").length,
    hasCustomer: !!b.stripeCustomerId,
  };
}

export async function assertNotReadOnly(businessId: number) {
  const b = await getBilling(businessId);
  if (b.readOnly) {
    throw new PaymentRequiredError("Your free trial has ended. Choose a plan in Settings → Plan & billing to keep making changes.");
  }
  return b;
}

/** Blocks scheduling a job into a month that's already at the plan's job limit. */
export async function assertJobCapacity(businessId: number, isoDate: string, excludeJobId?: number) {
  const b = await getBilling(businessId);
  const used = await countJobsInMonth(businessId, isoDate, excludeJobId);
  if (used >= b.jobLimit) {
    const month = new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-AU", { month: "long" });
    throw new PaymentRequiredError(
      b.plan === "solo"
        ? `You've scheduled ${used} jobs in ${month}, the Solo limit. Upgrade to Team in Settings → Plan & billing to book more.`
        : `You've reached ${used} scheduled jobs in ${month}, the plan limit. Contact support to raise it.`,
    );
  }
}

export async function assertSeat(businessId: number, role: "admin" | "crew") {
  const b = await getBilling(businessId);
  const p = PLANS[b.plan];
  if (role === "crew" && b.crewUsed >= p.crewSeats) {
    throw new PaymentRequiredError(`${p.name} includes ${p.crewSeats} crew logins and they're all used.${b.plan === "solo" ? " Upgrade to Team for up to 15." : ""}`);
  }
  if (role === "admin" && b.officeUsed >= p.officeSeats) {
    throw new PaymentRequiredError(
      b.plan === "solo" ? "Solo includes the owner login only. Upgrade to Team to add office admins." : `${p.name} includes ${p.officeSeats} office logins and they're all used.`,
    );
  }
}

export async function assertFeature(businessId: number, feature: "leadConnector") {
  const b = await getBilling(businessId);
  if (feature === "leadConnector" && !PLANS[b.plan].leadConnector) {
    throw new PaymentRequiredError("LeadConnector sync is included in the Team plan. Upgrade in Settings → Plan & billing.");
  }
}

// ---------- Stripe (platform account) ----------

type Price = { id: string; lookup_key?: string | null };
type Sub = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  items: { data: { id: string; price: Price; current_period_end?: number }[] };
  metadata?: Record<string, string>;
  pending_update?: unknown;
  default_payment_method?: PaymentMethod | string | null;
};
type PaymentMethod = { id: string; card?: { brand: string; last4: string; exp_month: number; exp_year: number } };

/** Finds the plan's monthly price by lookup key, creating product + price on first use. */
async function priceFor(plan: PlanKey) {
  const p = PLANS[plan];
  const found = await stripeApi<{ data: Price[] }>("/prices", { params: { "lookup_keys[]": p.lookupKey, active: true, limit: 1 } });
  if (found.data[0]) return found.data[0].id;
  const created = await stripeApi<Price>("/prices", {
    method: "POST",
    params: {
      currency: "aud",
      unit_amount: p.price * 100,
      recurring: { interval: "month" },
      lookup_key: p.lookupKey,
      transfer_lookup_key: true,
      tax_behavior: "exclusive",
      product_data: { name: `Home Service Ops — ${p.name}` },
    },
  });
  return created.id;
}

async function ensureCustomer(businessId: number, email: string) {
  const b = await db.selectFrom("businesses").select(["name", "stripeCustomerId"]).where("id", "=", businessId).executeTakeFirstOrThrow();
  if (b.stripeCustomerId) return b.stripeCustomerId;
  const c = await stripeApi<{ id: string }>("/customers", {
    method: "POST",
    params: { name: b.name, email, metadata: { business_id: String(businessId) } },
  });
  await db.updateTable("businesses").set({ stripeCustomerId: c.id }).where("id", "=", businessId).execute();
  return c.id;
}

export async function createCheckout(businessId: number, email: string, plan: PlanKey, origin: string) {
  const b = await db.selectFrom("businesses").selectAll().where("id", "=", businessId).executeTakeFirstOrThrow();
  if (b.stripeSubscriptionId && b.subscriptionStatus && ACTIVE_SUB.includes(b.subscriptionStatus)) {
    throw new Error("You already have a subscription. Use Manage billing to change plan.");
  }
  const customer = await ensureCustomer(businessId, email);
  const price = await priceFor(plan);
  const ret = `${API_URL}/billing/return`;
  // Keep whatever's left of the free trial (Stripe needs at least 48h).
  const trialEnd = b.trialEndsAt && b.trialEndsAt.getTime() > Date.now() + 49 * 3600_000 ? Math.floor(b.trialEndsAt.getTime() / 1000) : undefined;
  const session = await stripeApi<{ url: string }>("/checkout/sessions", {
    method: "POST",
    params: {
      mode: "subscription",
      customer,
      client_reference_id: String(businessId),
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { business_id: String(businessId), plan }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      success_url: `${ret}?result=success`,
      cancel_url: `${ret}?result=cancelled`,
    },
  });
  return { url: session.url };
}

export async function createPortal(businessId: number, origin: string) {
  const b = await db.selectFrom("businesses").select(["stripeCustomerId"]).where("id", "=", businessId).executeTakeFirstOrThrow();
  if (!b.stripeCustomerId) throw new Error("There's no billing account yet. Choose a plan first.");
  const s = await stripeApi<{ url: string }>("/billing_portal/sessions", {
    method: "POST",
    params: { customer: b.stripeCustomerId, return_url: `${API_URL}/billing/return?result=portal` },
  });
  return { url: s.url };
}

function planFromSub(sub: Sub): PlanKey | null {
  const key = sub.items.data[0]?.price.lookup_key;
  if (key === PLANS.team.lookupKey) return "team";
  if (key === PLANS.solo.lookupKey) return "solo";
  const meta = sub.metadata?.plan;
  return meta === "solo" || meta === "team" ? meta : null;
}

async function applySub(businessId: number, sub: Sub | null) {
  if (!sub) {
    await db
      .updateTable("businesses")
      .set({ stripeSubscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, billingSyncedAt: new Date() })
      .where("id", "=", businessId)
      .execute();
    return;
  }
  const end = sub.current_period_end ?? sub.items.data[0]?.current_period_end;
  const plan = planFromSub(sub);
  await db
    .updateTable("businesses")
    .set({
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: end ? new Date(end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      billingSyncedAt: new Date(),
      ...(plan ? { plan } : {}),
    })
    .where("id", "=", businessId)
    .execute();
}

/** Pulls the latest subscription for a business from Stripe. */
export async function syncSubscription(businessId: number) {
  const b = await db.selectFrom("businesses").select(["stripeCustomerId"]).where("id", "=", businessId).executeTakeFirstOrThrow();
  if (!b.stripeCustomerId) return;
  const list = await stripeApi<{ data: Sub[] }>("/subscriptions", { params: { customer: b.stripeCustomerId, status: "all", limit: 5 } });
  const order = ["active", "trialing", "past_due", "unpaid", "incomplete", "canceled", "incomplete_expired"];
  const best = [...list.data].sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status))[0] ?? null;
  await applySub(businessId, best);
}

/** Platform webhook: subscription changes. */
export async function handleBillingEvent(event: { type: string; data: { object: { customer?: string; object?: string } } }) {
  if (!event.type.startsWith("customer.subscription.") && event.type !== "checkout.session.completed" && event.type !== "invoice.paid" && event.type !== "invoice.payment_failed") {
    return "ignored";
  }
  const customer = event.data.object.customer;
  if (!customer) return "no customer";
  const b = await db.selectFrom("businesses").select("id").where("stripeCustomerId", "=", customer).executeTakeFirst();
  if (!b) return "unknown customer";
  await syncSubscription(b.id);
  return "synced";
}

// ---------- in-app billing management ----------

export type BillingCard = { brand: string; last4: string; expMonth: number; expYear: number };
export type BillingDetails = { name: string; email: string; line1: string; city: string; state: string; postcode: string };
export type BillingInvoice = { id: string; number: string; date: Date; total: number; status: string; url: string | null; pdf: string | null };
export type BillingOverview = {
  card: BillingCard | null;
  details: BillingDetails | null;
  invoices: BillingInvoice[];
  nextCharge: { amount: number; date: Date } | null;
};

type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
  address?: { line1?: string | null; city?: string | null; state?: string | null; postal_code?: string | null } | null;
  invoice_settings?: { default_payment_method?: PaymentMethod | string | null };
};
type Invoice = {
  id: string;
  number?: string | null;
  created: number;
  total: number;
  amount_due: number;
  status?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  next_payment_attempt?: number | null;
  period_end?: number;
};

const cardOf = (pm: PaymentMethod | string | null | undefined): BillingCard | null =>
  pm && typeof pm === "object" && pm.card ? { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year } : null;

async function billingRow(businessId: number) {
  return db.selectFrom("businesses").selectAll().where("id", "=", businessId).executeTakeFirstOrThrow();
}

/** Card on file, billing details, invoices and the next charge, straight from Stripe. */
export async function getBillingOverview(businessId: number): Promise<BillingOverview> {
  const b = await billingRow(businessId);
  if (!b.stripeCustomerId || !isStripeConfigured()) return { card: null, details: null, invoices: [], nextCharge: null };
  const [cust, inv, sub] = await Promise.all([
    stripeApi<Customer>(`/customers/${b.stripeCustomerId}`, { params: { "expand[]": "invoice_settings.default_payment_method" } }),
    stripeApi<{ data: Invoice[] }>("/invoices", { params: { customer: b.stripeCustomerId, limit: 12 } }),
    b.stripeSubscriptionId
      ? stripeApi<Sub>(`/subscriptions/${b.stripeSubscriptionId}`, { params: { "expand[]": "default_payment_method" } }).catch(() => null)
      : Promise.resolve(null),
  ]);
  let nextCharge: BillingOverview["nextCharge"] = null;
  if (sub && ACTIVE_SUB.includes(sub.status) && !sub.cancel_at_period_end) {
    const preview = await stripeApi<Invoice>("/invoices/create_preview", {
      method: "POST",
      params: { customer: b.stripeCustomerId, subscription: sub.id },
    }).catch(() => stripeApi<Invoice>("/invoices/upcoming", { params: { customer: b.stripeCustomerId!, subscription: sub.id } }).catch(() => null));
    const when = preview?.next_payment_attempt ?? preview?.period_end ?? sub.current_period_end ?? sub.items.data[0]?.current_period_end;
    if (preview && when) nextCharge = { amount: preview.amount_due / 100, date: new Date(when * 1000) };
  }
  const a = cust.address ?? {};
  return {
    card: cardOf(sub?.default_payment_method) ?? cardOf(cust.invoice_settings?.default_payment_method),
    details: {
      name: cust.name ?? "",
      email: cust.email ?? "",
      line1: a.line1 ?? "",
      city: a.city ?? "",
      state: a.state ?? "",
      postcode: a.postal_code ?? "",
    },
    invoices: inv.data
      .filter((i) => i.status !== "draft")
      .map((i) => ({
        id: i.id,
        number: i.number ?? i.id.slice(-8).toUpperCase(),
        date: new Date(i.created * 1000),
        total: i.total / 100,
        status: i.status ?? "open",
        url: i.hosted_invoice_url ?? null,
        pdf: i.invoice_pdf ?? null,
      })),
    nextCharge,
  };
}

async function liveSub(businessId: number) {
  const b = await billingRow(businessId);
  if (!b.stripeSubscriptionId || !b.subscriptionStatus || !ACTIVE_SUB.includes(b.subscriptionStatus)) {
    throw new Error("There's no active subscription yet. Choose a plan first.");
  }
  return stripeApi<Sub>(`/subscriptions/${b.stripeSubscriptionId}`);
}

/** Upgrade now (prorated difference charged today) or downgrade now (unused time credited to the next invoice). */
export async function changePlan(businessId: number, plan: PlanKey) {
  const sub = await liveSub(businessId);
  const current = planFromSub(sub);
  if (current === plan) throw new Error(`You're already on ${PLANS[plan].name}.`);
  const target = PLANS[plan];
  const upgrade = !current || target.price > PLANS[current].price;
  if (!upgrade) {
    const now = await getBilling(businessId);
    const over: string[] = [];
    if (now.jobsThisMonth > target.jobsPerMonth) over.push(`${now.jobsThisMonth} jobs scheduled this month (limit ${target.jobsPerMonth})`);
    if (now.officeUsed > target.officeSeats) over.push(`${now.officeUsed} office logins (limit ${target.officeSeats})`);
    if (now.crewUsed > target.crewSeats) over.push(`${now.crewUsed} crew logins (limit ${target.crewSeats})`);
    if (over.length) throw new Error(`${target.name} doesn't fit yet: you have ${over.join(", ")}. Remove the extras, then try again.`);
  }
  const item = sub.items.data[0];
  if (!item) throw new Error("This subscription has no plan item. Contact support.");
  const price = await priceFor(plan);
  const updated = await stripeApi<Sub>(`/subscriptions/${sub.id}`, {
    method: "POST",
    params: {
      items: [{ id: item.id, price }],
      proration_behavior: sub.status === "trialing" ? "none" : upgrade ? "always_invoice" : "create_prorations",
      ...(upgrade && sub.status !== "trialing" ? { payment_behavior: "pending_if_incomplete" } : {}),
    },
  });
  if (updated.pending_update) {
    throw new Error("Your card was declined, so the plan wasn't changed. Update your card and try again.");
  }
  await applySub(businessId, updated);
  return {
    message: upgrade
      ? sub.status === "trialing"
        ? `Switched to ${target.name}. You'll be billed $${target.price}/month + GST when the trial ends.`
        : `Upgraded to ${target.name}. The prorated difference has been charged to your card.`
      : `Switched to ${target.name}. Unused time on your old plan is credited to your next invoice.`,
  };
}

/** Cancel at the end of the paid period, or undo a pending cancellation. */
export async function setCancelAtPeriodEnd(businessId: number, cancel: boolean) {
  const sub = await liveSub(businessId);
  const updated = await stripeApi<Sub>(`/subscriptions/${sub.id}`, { method: "POST", params: { cancel_at_period_end: cancel } });
  await applySub(businessId, updated);
  const end = updated.current_period_end ?? updated.items.data[0]?.current_period_end;
  const date = end ? new Date(end * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "the end of this period";
  return { message: cancel ? `Your plan will end on ${date}. You can resume any time before then.` : "Your subscription will keep renewing." };
}

export async function updateBillingDetails(businessId: number, fallbackEmail: string, d: BillingDetails) {
  const customer = await ensureCustomer(businessId, d.email || fallbackEmail);
  await stripeApi(`/customers/${customer}`, {
    method: "POST",
    params: {
      name: d.name,
      email: d.email,
      address: { line1: d.line1, city: d.city, state: d.state, postal_code: d.postcode, country: "AU" },
    },
  });
  return { message: "Billing details saved. They'll appear on your next invoice." };
}

/** A secure Stripe page (Checkout in setup mode) for adding or replacing the card. */
export async function createCardUpdate(businessId: number, email: string, origin: string) {
  const customer = await ensureCustomer(businessId, email);
  const s = await stripeApi<{ url: string }>("/checkout/sessions", {
    method: "POST",
    params: {
      mode: "setup",
      customer,
      currency: "aud",
      success_url: `${API_URL}/billing/return?result=card&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${API_URL}/billing/return?result=cancelled`,
    },
  });
  return { url: s.url };
}

/** After the card page: make the new card the default and retry anything overdue. */
export async function finishCardUpdate(sessionId: string) {
  const s = await stripeApi<{ customer?: string; setup_intent?: { payment_method?: string | null } | null; status?: string }>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { params: { "expand[]": "setup_intent" } },
  );
  const pm = s.setup_intent?.payment_method;
  if (!s.customer || !pm || s.status !== "complete") return false;
  const b = await db.selectFrom("businesses").select(["id", "stripeSubscriptionId"]).where("stripeCustomerId", "=", s.customer).executeTakeFirst();
  if (!b) return false;
  await stripeApi(`/customers/${s.customer}`, { method: "POST", params: { invoice_settings: { default_payment_method: pm } } });
  if (b.stripeSubscriptionId) {
    await stripeApi(`/subscriptions/${b.stripeSubscriptionId}`, { method: "POST", params: { default_payment_method: pm } }).catch(() => null);
  }
  const open = await stripeApi<{ data: { id: string }[] }>("/invoices", { params: { customer: s.customer, status: "open", limit: 5 } }).catch(() => ({ data: [] }));
  for (const i of open.data) {
    await stripeApi(`/invoices/${i.id}/pay`, { method: "POST", params: { payment_method: pm } }).catch(() => null);
  }
  await syncSubscription(b.id).catch(() => null);
  return true;
}
