import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { syncJobsToCalendar } from "./calendarSync";
import { pushToLc } from "./lcSync";
import { API_URL } from "./serverEnv";

// Server-only: "Connect with Stripe" (Stripe Connect, Standard accounts via OAuth), one
// connected account per business, and pay-now links created as direct charges on it.

const API = "https://api.stripe.com/v1";
export const STRIPE_CALLBACK_PATH = "/stripe/callback";
const STATE_TTL_MS = 15 * 60 * 1000;

function env() {
  const e = process.env as unknown as Record<string, string | undefined>;
  return { secret: e.STRIPE_SECRET_KEY, clientId: e.STRIPE_CLIENT_ID, webhookSecret: e.STRIPE_WEBHOOK_SECRET };
}
export function isStripeConfigured() {
  const e = env();
  return !!e.secret && !!e.clientId;
}
export function hasStripeWebhook() {
  return !!env().webhookSecret;
}
function requireEnv() {
  const e = env();
  if (!e.secret || !e.clientId) throw new Error("Stripe isn't configured for this app yet.");
  return { secret: e.secret, clientId: e.clientId };
}

// Stripe expects form encoding with bracketed keys for nested objects.
type Params = { [k: string]: string | number | boolean | undefined | Params | Params[] };
function encode(params: Params, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => encode(item, `${key}[${i}]`, out));
    else if (typeof v === "object") encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe<T>(path: string, opts: { method?: "GET" | "POST"; params?: Params; account?: string; base?: string } = {}) {
  const { secret } = requireEnv();
  const method = opts.method ?? "GET";
  const body = opts.params ? encode(opts.params) : undefined;
  const url = `${opts.base ?? API}${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(opts.account ? { "Stripe-Account": opts.account } : {}),
    },
    body: method === "POST" && body ? body : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string; error_description?: string };
  if (!res.ok) {
    const err = json.error;
    const msg = typeof err === "string" ? json.error_description || err : err?.message;
    throw new Error(msg || `Stripe request failed (${res.status})`);
  }
  return json as T;
}

/** Raw Stripe API call on the LSP platform account (or a connected account via `account`). */
export const stripeApi = stripe;
export type StripeParams = Params;

// ---------- connect / disconnect ----------

export async function startStripeAuth(origin: string, businessId: number) {
  const { clientId } = requireEnv();
  const redirectUri = `${API_URL}${STRIPE_CALLBACK_PATH}`;
  const state = randomBytes(24).toString("hex");
  await db.deleteFrom("stripeOauthStates").where("createdAt", "<", new Date(Date.now() - STATE_TTL_MS)).execute();
  await db.insertInto("stripeOauthStates").values({ state, redirectUri, businessId }).execute();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    redirect_uri: redirectUri,
    state,
    "stripe_user[country]": "AU",
  });
  return { authorizeUrl: `https://connect.stripe.com/oauth/authorize?${params}` };
}

type Account = {
  id: string;
  default_currency?: string;
  business_profile?: { name?: string | null };
  settings?: { dashboard?: { display_name?: string | null } };
  email?: string | null;
};

export async function finishStripeAuth(code: string, state: string) {
  const row = await db.deleteFrom("stripeOauthStates").where("state", "=", state).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - STATE_TTL_MS) {
    throw new Error("This connection link has expired. Please try connecting again.");
  }
  const businessId = row.businessId;
  const tok = await stripe<{ stripe_user_id: string; livemode: boolean }>("/oauth/token", {
    method: "POST",
    base: "https://connect.stripe.com",
    params: { grant_type: "authorization_code", code },
  });
  const taken = await db.selectFrom("stripeConnection").select("businessId").where("accountId", "=", tok.stripe_user_id).executeTakeFirst();
  if (taken && taken.businessId !== businessId) throw new Error("That Stripe account is already connected to another business.");

  let name = "";
  let currency = "aud";
  try {
    const acct = await stripe<Account>(`/accounts/${tok.stripe_user_id}`);
    name = acct.settings?.dashboard?.display_name || acct.business_profile?.name || acct.email || "";
    currency = acct.default_currency || "aud";
  } catch {
    /* name is cosmetic */
  }
  const values = { accountId: tok.stripe_user_id, accountName: name, livemode: tok.livemode, currency, connectedAt: new Date() };
  const prev = await db.selectFrom("stripeConnection").select("accountId").where("businessId", "=", businessId).executeTakeFirst();
  if (prev && prev.accountId !== values.accountId) {
    // Links from the old account can't be checked with the new one.
    await db
      .updateTable("jobs")
      .set({ stripeLinkId: null, stripeLinkUrl: null, stripeLinkAmount: null })
      .where("businessId", "=", businessId)
      .where("stripeLinkId", "is not", null)
      .execute();
  }
  await db
    .insertInto("stripeConnection")
    .values({ businessId, ...values })
    .onConflict((oc) => oc.column("businessId").doUpdateSet(values))
    .execute();
  return { accountName: name || tok.stripe_user_id, livemode: tok.livemode };
}

export async function disconnectStripe(businessId: number) {
  const conn = await db.selectFrom("stripeConnection").select("accountId").where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) return;
  try {
    await stripe("/oauth/deauthorize", {
      method: "POST",
      base: "https://connect.stripe.com",
      params: { client_id: requireEnv().clientId, stripe_user_id: conn.accountId },
    });
  } catch (e) {
    console.error("Stripe deauthorize failed", e instanceof Error ? e.message : e);
  }
  await db.deleteFrom("stripeConnection").where("businessId", "=", businessId).execute();
}

async function requireConnection(businessId: number) {
  const c = await db.selectFrom("stripeConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!c) throw new Error("Stripe isn't connected. Connect it in Settings first.");
  return c;
}

// ---------- pay-now links ----------

const invoiceNum = (jobNum: string) => "INV-" + jobNum.replace(/^LC-/, "");

export async function createJobPaymentLink(businessId: number, jobId: number) {
  const conn = await requireConnection(businessId);
  const job = await db.selectFrom("jobs").selectAll().where("id", "=", jobId).where("businessId", "=", businessId).executeTakeFirst();
  if (!job) throw new Error("Job not found");
  if (job.status === "Paid") throw new Error("This job is already paid.");
  const amount = Math.round(Number(job.price) * 100);
  if (amount < 50) throw new Error("The job total must be at least $0.50 to take a card payment.");

  // Reuse the existing link if the amount hasn't changed.
  if (job.stripeLinkId && job.stripeLinkUrl && Math.round(Number(job.stripeLinkAmount) * 100) === amount) {
    return { url: job.stripeLinkUrl, amount: amount / 100, reused: true };
  }
  if (job.stripeLinkId) {
    await stripe(`/payment_links/${job.stripeLinkId}`, { method: "POST", account: conn.accountId, params: { active: false } }).catch(() => undefined);
  }

  const inv = invoiceNum(job.num);
  const price = await stripe<{ id: string }>("/prices", {
    method: "POST",
    account: conn.accountId,
    params: {
      currency: conn.currency || "aud",
      unit_amount: amount,
      product_data: { name: `${inv} · ${job.service || "Service"}` },
    },
  });
  const link = await stripe<{ id: string; url: string }>("/payment_links", {
    method: "POST",
    account: conn.accountId,
    params: {
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { job_id: String(job.id), invoice: inv },
      payment_intent_data: { metadata: { job_id: String(job.id), invoice: inv }, description: `${inv} · ${job.customer}` },
      restrictions: { completed_sessions: { limit: 1 } },
      after_completion: { type: "hosted_confirmation", hosted_confirmation: { custom_message: `Thanks ${job.customer.split(" ")[0]}! Payment for ${inv} received.` } },
    },
  });

  await db
    .updateTable("jobs")
    .set({ stripeLinkId: link.id, stripeLinkUrl: link.url, stripeLinkAmount: amount / 100, payMethod: "online", payState: "awaiting" })
    .where("id", "=", job.id)
    .execute();
  return { url: link.url, amount: amount / 100, reused: false };
}

export async function markJobPaidByStripe(jobId: number, sessionId: string) {
  const updated = await db
    .updateTable("jobs")
    .set({ status: "Paid", payMethod: "online", payState: "paid", statusChangedAt: new Date(), stripeSessionId: sessionId })
    .where("id", "=", jobId)
    .where("status", "!=", "Paid")
    .returning("id")
    .executeTakeFirst();
  if (updated) {
    await syncJobsToCalendar([jobId]);
    const j = await db.selectFrom("jobs").select("businessId").where("id", "=", jobId).executeTakeFirst();
    if (j) {
      await pushToLc(j.businessId, { jobIds: [jobId] });
      const { maybeSendReviews } = await import("./reviews");
      await maybeSendReviews(j.businessId);
      const { maybeSyncXero } = await import("./xero");
      await maybeSyncXero(j.businessId);
    }
  }
  return !!updated;
}

type Session = { id: string; status: string; payment_status: string; payment_link?: string | null };

/** Ask Stripe whether the job's pay-now link has been paid; marks the job paid if so. */
export async function checkJobPayment(businessId: number, jobId: number) {
  const conn = await requireConnection(businessId);
  const job = await db
    .selectFrom("jobs")
    .select(["id", "status", "stripeLinkId"])
    .where("id", "=", jobId)
    .where("businessId", "=", businessId)
    .executeTakeFirst();
  if (!job) throw new Error("Job not found");
  if (job.status === "Paid") return { paid: true, justPaid: false };
  if (!job.stripeLinkId) return { paid: false, justPaid: false };
  const list = await stripe<{ data: Session[] }>("/checkout/sessions", {
    account: conn.accountId,
    params: { payment_link: job.stripeLinkId, limit: 10 },
  });
  const paid = list.data.find((s) => s.status === "complete" && s.payment_status === "paid");
  if (!paid) return { paid: false, justPaid: false };
  const justPaid = await markJobPaidByStripe(job.id, paid.id);
  return { paid: true, justPaid };
}

// ---------- webhook ----------

/** Verifies Stripe's signature header (v1, HMAC-SHA256) against the raw body. */
export function verifyStripeSignature(raw: string, header: string | null, toleranceSec = 300, secretOverride?: string) {
  const secret = secretOverride ?? env().webhookSecret;
  if (!secret) throw new Error("Webhook signing secret isn't configured.");
  if (!header) throw new Error("Missing Stripe-Signature header");
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]).filter((p) => p.length === 2)) as Record<string, string>;
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) throw new Error("Stripe webhook timestamp outside tolerance");
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const ok = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw new Error("Invalid Stripe signature");
}

export async function handleStripeEvent(event: { type: string; account?: string; data: { object: Session } }) {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return "ignored";
  const s = event.data.object;
  if (s.payment_status !== "paid" || !s.payment_link) return "not paid";
  if (!event.account) return "platform event";
  const conn = await db.selectFrom("stripeConnection").select("businessId").where("accountId", "=", event.account).executeTakeFirst();
  if (!conn) return "unknown account";
  const job = await db
    .selectFrom("jobs")
    .select("id")
    .where("stripeLinkId", "=", s.payment_link)
    .where("businessId", "=", conn.businessId)
    .executeTakeFirst();
  if (!job) return "no job";
  await markJobPaidByStripe(job.id, s.id);
  return "paid";
}
