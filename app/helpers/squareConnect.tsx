import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { PUBLIC_APP_URL } from "./mailer";
import { invoiceNumOf, markJobPaidOnline } from "./onlinePay";
import { API_URL } from "./serverEnv";

// Server-only: "Connect with Square" (OAuth code flow, one seller per business) and
// Square payment links (Checkout API quick pay) for invoices.

export const SQUARE_CALLBACK_PATH = "/square/callback";
export const SQUARE_WEBHOOK_PATH = "/square/webhook";
const SQUARE_VERSION = "2026-09-16";
const STATE_TTL_MS = 15 * 60 * 1000;
const SCOPES = ["ORDERS_WRITE", "ORDERS_READ", "PAYMENTS_WRITE", "PAYMENTS_READ", "MERCHANT_PROFILE_READ"];

function env() {
  const e = process.env as unknown as Record<string, string | undefined>;
  return { appId: e.SQUARE_APP_ID?.trim(), secret: e.SQUARE_APP_SECRET?.trim(), sigKey: e.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim() };
}
export function isSquareConfigured() {
  const e = env();
  return !!e.appId && !!e.secret;
}
export function isSquareSandbox() {
  return (env().appId ?? "").startsWith("sandbox-");
}
const base = () => (isSquareSandbox() ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com");
function requireEnv() {
  const e = env();
  if (!e.appId || !e.secret) throw new Error("Square isn't set up for this app yet.");
  return { appId: e.appId, secret: e.secret };
}

type SqError = { errors?: { detail?: string; code?: string }[]; message?: string; error_description?: string };

async function sq<T>(path: string, opts: { token?: string; method?: "GET" | "POST" | "DELETE"; body?: unknown; auth?: string } = {}) {
  const res = await fetch(`${base()}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.auth ? { Authorization: opts.auth } : opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = (await res.json().catch(() => ({}))) as T & SqError;
  if (!res.ok) {
    const msg = json.errors?.[0]?.detail || json.error_description || json.message;
    throw new Error(msg ? `Square: ${msg}` : `Square request failed (${res.status})`);
  }
  return json as T;
}

// ---------- connect / disconnect ----------

export async function startSquareAuth(businessId: number) {
  const { appId } = requireEnv();
  const state = randomBytes(24).toString("hex");
  await db.deleteFrom("squareOauthStates").where("createdAt", "<", new Date(Date.now() - STATE_TTL_MS)).execute();
  await db.insertInto("squareOauthStates").values({ state, businessId }).execute();
  // redirect_uri must exactly match the one saved in the app's OAuth settings (Sandbox or Production tab).
  // The sandbox authorize page renders blank with session=false, so only send it in production.
  const redirect = encodeURIComponent(`${API_URL}${SQUARE_CALLBACK_PATH}`);
  const session = isSquareSandbox() ? "" : "&session=false";
  const url = `${base()}/oauth2/authorize?client_id=${encodeURIComponent(appId)}&scope=${SCOPES.join("+")}${session}&state=${state}&redirect_uri=${redirect}`;
  return { authorizeUrl: url };
}

type TokenRes = { access_token: string; refresh_token?: string; expires_at: string; merchant_id: string };
type Location = { id: string; name?: string; business_name?: string; currency?: string; country?: string; status?: string };

export async function finishSquareAuth(code: string, state: string) {
  const row = await db.deleteFrom("squareOauthStates").where("state", "=", state).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - STATE_TTL_MS) throw new Error("This connection link has expired. Please try connecting again.");
  const businessId = row.businessId;
  const { appId, secret } = requireEnv();
  const tok = await sq<TokenRes>("/oauth2/token", {
    method: "POST",
    body: { client_id: appId, client_secret: secret, grant_type: "authorization_code", code, redirect_uri: `${API_URL}${SQUARE_CALLBACK_PATH}` },
  });
  if (!tok.refresh_token) throw new Error("Square didn't return a refresh token. Please try again.");
  const taken = await db.selectFrom("squareConnection").select("businessId").where("merchantId", "=", tok.merchant_id).executeTakeFirst();
  if (taken && taken.businessId !== businessId) throw new Error("That Square account is already connected to another business.");

  const loc = await sq<{ location: Location }>("/v2/locations/main", { token: tok.access_token });
  const l = loc.location;
  if (l.status && l.status !== "ACTIVE") throw new Error("Your main Square location isn't active.");
  let name = l.business_name || l.name || "";
  try {
    const m = await sq<{ merchant: { business_name?: string } }>(`/v2/merchants/${tok.merchant_id}`, { token: tok.access_token });
    name = m.merchant.business_name || name;
  } catch {
    /* cosmetic */
  }
  const values = {
    merchantId: tok.merchant_id,
    merchantName: name,
    locationId: l.id,
    currency: l.currency || "AUD",
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: new Date(tok.expires_at),
    livemode: !isSquareSandbox(),
    connectedAt: new Date(),
  };
  const prev = await db.selectFrom("squareConnection").select("merchantId").where("businessId", "=", businessId).executeTakeFirst();
  if (prev && prev.merchantId !== values.merchantId) {
    await db
      .updateTable("jobs")
      .set({ squareLinkId: null, squareLinkUrl: null, squareOrderId: null, squareLinkAmount: null })
      .where("businessId", "=", businessId)
      .where("status", "!=", "Paid")
      .execute();
  }
  await db
    .insertInto("squareConnection")
    .values({ businessId, ...values })
    .onConflict((oc) => oc.column("businessId").doUpdateSet(values))
    .execute();
  // First card provider connected becomes the default.
  const stripe = await db.selectFrom("stripeConnection").select("businessId").where("businessId", "=", businessId).executeTakeFirst();
  if (!stripe) await db.updateTable("settings").set({ cardProvider: "square" }).where("businessId", "=", businessId).execute();
  return { name: name || tok.merchant_id, livemode: values.livemode };
}

export async function disconnectSquare(businessId: number) {
  const conn = await db.selectFrom("squareConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) return;
  try {
    const { appId, secret } = requireEnv();
    await sq("/oauth2/revoke", { method: "POST", auth: `Client ${secret}`, body: { client_id: appId, merchant_id: conn.merchantId } });
  } catch (e) {
    console.error("Square revoke failed", e instanceof Error ? e.message : e);
  }
  await db.deleteFrom("squareConnection").where("businessId", "=", businessId).execute();
  await db.updateTable("settings").set({ cardProvider: "stripe" }).where("businessId", "=", businessId).where("cardProvider", "=", "square").execute();
}

/** Connection with a fresh access token (refreshes when it has less than 5 days left). */
async function liveConnection(businessId: number) {
  const c = await db.selectFrom("squareConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!c) throw new Error("Square isn't connected. Connect it in Settings first.");
  if (c.expiresAt.getTime() - Date.now() > 5 * 86_400_000) return c;
  const { appId, secret } = requireEnv();
  const tok = await sq<TokenRes>("/oauth2/token", {
    method: "POST",
    body: { client_id: appId, client_secret: secret, grant_type: "refresh_token", refresh_token: c.refreshToken },
  });
  const patch = { accessToken: tok.access_token, refreshToken: tok.refresh_token || c.refreshToken, expiresAt: new Date(tok.expires_at) };
  await db.updateTable("squareConnection").set(patch).where("businessId", "=", businessId).execute();
  return { ...c, ...patch };
}

export async function squareStatus(businessId: number) {
  const c = await db
    .selectFrom("squareConnection")
    .select(["merchantId", "merchantName", "livemode", "connectedAt", "currency"])
    .where("businessId", "=", businessId)
    .executeTakeFirst();
  return {
    configured: isSquareConfigured(),
    webhook: !!env().sigKey,
    sandbox: isSquareSandbox(),
    connected: !!c,
    merchantName: c?.merchantName || c?.merchantId || null,
    livemode: c?.livemode ?? !isSquareSandbox(),
    connectedAt: c?.connectedAt ?? null,
  };
}

// ---------- payment links ----------

export async function createSquareLink(businessId: number, jobId: number) {
  const conn = await liveConnection(businessId);
  const job = await db.selectFrom("jobs").selectAll().where("id", "=", jobId).where("businessId", "=", businessId).executeTakeFirst();
  if (!job) throw new Error("Job not found");
  if (job.status === "Paid") throw new Error("This job is already paid.");
  const amount = Math.round(Number(job.price) * 100);
  if (amount < 100) throw new Error("The job total must be at least $1.00 to take a card payment.");
  if (job.squareLinkUrl && job.squareOrderId && Math.round(Number(job.squareLinkAmount) * 100) === amount) {
    return { url: job.squareLinkUrl, amount: amount / 100, reused: true };
  }
  if (job.squareLinkId) {
    await sq(`/v2/online-checkout/payment-links/${job.squareLinkId}`, { method: "DELETE", token: conn.accessToken }).catch(() => undefined);
  }
  const inv = invoiceNumOf(job.num);
  const res = await sq<{ payment_link: { id: string; url: string; order_id: string } }>("/v2/online-checkout/payment-links", {
    method: "POST",
    token: conn.accessToken,
    body: {
      idempotency_key: randomUUID(),
      quick_pay: {
        name: `${inv} · ${job.service || "Service"}`.slice(0, 255),
        price_money: { amount, currency: conn.currency || "AUD" },
        location_id: conn.locationId,
      },
      payment_note: `${inv} · ${job.customer}`.slice(0, 500),
      checkout_options: { ask_for_shipping_address: false, allow_tipping: false },
    },
  });
  const link = res.payment_link;
  await db
    .updateTable("jobs")
    .set({
      squareLinkId: link.id,
      squareLinkUrl: link.url,
      squareOrderId: link.order_id,
      squareLinkAmount: amount / 100,
      payMethod: "online",
      payState: "awaiting",
      payProvider: "square",
    })
    .where("id", "=", job.id)
    .execute();
  return { url: link.url, amount: amount / 100, reused: false };
}

type Order = { id: string; tenders?: { payment_id?: string }[] };
type Payment = { id: string; status: string; order_id?: string };

/** Asks Square whether the job's link has been paid; marks the job paid if so. */
export async function checkSquarePayment(businessId: number, jobId: number) {
  const job = await db.selectFrom("jobs").select(["id", "status", "squareOrderId"]).where("id", "=", jobId).where("businessId", "=", businessId).executeTakeFirst();
  if (!job) throw new Error("Job not found");
  if (job.status === "Paid") return { paid: true, justPaid: false };
  if (!job.squareOrderId) return { paid: false, justPaid: false };
  const conn = await liveConnection(businessId);
  const { order } = await sq<{ order: Order }>(`/v2/orders/${job.squareOrderId}`, { token: conn.accessToken });
  for (const t of order.tenders ?? []) {
    if (!t.payment_id) continue;
    const { payment } = await sq<{ payment: Payment }>(`/v2/payments/${t.payment_id}`, { token: conn.accessToken });
    if (payment.status === "COMPLETED") {
      const justPaid = await markJobPaidOnline(job.id, "square");
      return { paid: true, justPaid };
    }
  }
  return { paid: false, justPaid: false };
}

// ---------- webhook ----------

export function verifySquareSignature(raw: string, header: string | null) {
  const key = env().sigKey;
  if (!key) throw new Error("Square webhook signature key isn't configured.");
  if (!header) throw new Error("Missing Square signature");
  const expected = createHmac("sha256", key).update(API_URL + SQUARE_WEBHOOK_PATH + raw).digest("base64");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid Square signature");
}

export async function handleSquareEvent(evt: { merchant_id?: string; type?: string; data?: { object?: { payment?: Payment } } }) {
  if (evt.type !== "payment.updated" && evt.type !== "payment.created") return "ignored";
  const p = evt.data?.object?.payment;
  if (!p || p.status !== "COMPLETED" || !p.order_id || !evt.merchant_id) return "not completed";
  const conn = await db.selectFrom("squareConnection").select("businessId").where("merchantId", "=", evt.merchant_id).executeTakeFirst();
  if (!conn) return "unknown merchant";
  const job = await db.selectFrom("jobs").select("id").where("squareOrderId", "=", p.order_id).where("businessId", "=", conn.businessId).executeTakeFirst();
  if (!job) return "no job";
  await markJobPaidOnline(job.id, "square");
  return "paid";
}
