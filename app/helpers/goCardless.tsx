import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { PUBLIC_APP_URL } from "./mailer";
import { invoiceNumOf, markJobPaidOnline } from "./onlinePay";
import { API_URL } from "./serverEnv";

// Server-only: GoCardless partner integration (each business connects its own GoCardless
// account) for BECS direct debit in AUD. In Australia a one-off payment needs a mandate
// first: the customer authorises direct debit once via a hosted Billing Request Flow,
// then each invoice is charged against that mandate. Money is "confirmed" ~2–3 business
// days after the charge, which is when the job is marked paid.

export const GC_CALLBACK_PATH = "/gocardless/callback";
const STATE_TTL_MS = 15 * 60 * 1000;
const LIVE_MANDATE = ["pending_customer_approval", "pending_submission", "submitted", "active"];
const DEAD_PAYMENT = ["failed", "cancelled", "customer_approval_denied", "charged_back"];

function env() {
  const e = process.env as unknown as Record<string, string | undefined>;
  return {
    clientId: e.GOCARDLESS_CLIENT_ID?.trim(),
    secret: e.GOCARDLESS_CLIENT_SECRET?.trim(),
    live: (e.GOCARDLESS_ENVIRONMENT ?? "").trim().toLowerCase().startsWith("live"),
    webhookSecret: e.GOCARDLESS_WEBHOOK_SECRET?.trim(),
  };
}
export function isGcConfigured() {
  const e = env();
  return !!e.clientId && !!e.secret;
}
const connectBase = () => (env().live ? "https://connect.gocardless.com" : "https://connect-sandbox.gocardless.com");
const apiBase = () => (env().live ? "https://api.gocardless.com" : "https://api-sandbox.gocardless.com");
function requireEnv() {
  const e = env();
  if (!e.clientId || !e.secret) throw new Error("GoCardless isn't set up for this app yet.");
  return { clientId: e.clientId, secret: e.secret };
}

type GcErr = { error?: { message?: string; errors?: { message?: string; field?: string }[] } };

async function gc<T>(path: string, token: string, opts: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "GoCardless-Version": "2015-07-06",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = (await res.json().catch(() => ({}))) as T & GcErr;
  if (!res.ok) {
    const e = json.error;
    const detail = e?.errors?.[0]?.message;
    throw new Error(`GoCardless: ${detail ? `${e?.message ?? ""} (${detail})` : e?.message || `request failed (${res.status})`}`);
  }
  return json as T;
}

async function connectPost<T>(path: string, form: Record<string, string>) {
  const res = await fetch(`${connectBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(json.error_description || json.error || `GoCardless connect failed (${res.status})`);
  return json as T;
}

// ---------- connect / disconnect ----------

export async function startGcAuth(origin: string, businessId: number) {
  const { clientId } = requireEnv();
  const redirectUri = `${API_URL}${GC_CALLBACK_PATH}`;
  const state = randomBytes(24).toString("hex");
  await db.deleteFrom("gocardlessOauthStates").where("createdAt", "<", new Date(Date.now() - STATE_TTL_MS)).execute();
  await db.insertInto("gocardlessOauthStates").values({ state, businessId, redirectUri }).execute();
  const [biz, s] = await Promise.all([
    db.selectFrom("businesses").select("name").where("id", "=", businessId).executeTakeFirst(),
    db.selectFrom("settings").select("business").where("businessId", "=", businessId).executeTakeFirst(),
  ]);
  const info = (s?.business ?? {}) as { name?: string; email?: string };
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    redirect_uri: redirectUri,
    state,
    initial_view: "signup",
    "prefill[country_code]": "AU",
  });
  const orgName = info.name || biz?.name;
  if (orgName) p.set("prefill[organisation_name]", orgName);
  if (info.email) p.set("prefill[email]", info.email);
  return { authorizeUrl: `${connectBase()}/oauth/authorize?${p}` };
}

export async function finishGcAuth(code: string, state: string) {
  const row = await db.deleteFrom("gocardlessOauthStates").where("state", "=", state).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - STATE_TTL_MS) throw new Error("This connection link has expired. Please try connecting again.");
  const { clientId, secret } = requireEnv();
  const tok = await connectPost<{ access_token: string; organisation_id: string; email?: string }>("/oauth/access_token", {
    grant_type: "authorization_code",
    code,
    redirect_uri: row.redirectUri,
    client_id: clientId,
    client_secret: secret,
  });
  const businessId = row.businessId;
  const taken = await db.selectFrom("gocardlessConnection").select("businessId").where("organisationId", "=", tok.organisation_id).executeTakeFirst();
  if (taken && taken.businessId !== businessId) throw new Error("That GoCardless account is already connected to another business.");
  let creditorName = "";
  try {
    const c = await gc<{ creditors: { name?: string }[] }>("/creditors?limit=1", tok.access_token);
    creditorName = c.creditors[0]?.name ?? "";
  } catch {
    /* cosmetic */
  }
  const prev = await db.selectFrom("gocardlessConnection").select("organisationId").where("businessId", "=", businessId).executeTakeFirst();
  if (prev && prev.organisationId !== tok.organisation_id) {
    // Mandates belong to the old GoCardless account.
    await db.updateTable("clients").set({ gcMandateId: null, gcCustomerId: null, gcMandateStatus: null }).where("businessId", "=", businessId).execute();
    await db
      .updateTable("jobs")
      .set({ gcBillingRequestId: null, gcFlowUrl: null, gcPaymentId: null, gcPaymentStatus: null, gcAmount: null })
      .where("businessId", "=", businessId)
      .where("status", "!=", "Paid")
      .execute();
  }
  const values = { organisationId: tok.organisation_id, accessToken: tok.access_token, email: tok.email ?? "", creditorName, livemode: env().live, connectedAt: new Date() };
  await db
    .insertInto("gocardlessConnection")
    .values({ businessId, ...values })
    .onConflict((oc) => oc.column("businessId").doUpdateSet(values))
    .execute();
  return { name: creditorName || tok.email || "your GoCardless account", livemode: values.livemode };
}

export async function disconnectGc(businessId: number) {
  const conn = await db.selectFrom("gocardlessConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) return;
  try {
    const { clientId, secret } = requireEnv();
    await connectPost("/oauth/revoke", { token: conn.accessToken, client_id: clientId, client_secret: secret });
  } catch (e) {
    console.error("GoCardless revoke failed", e instanceof Error ? e.message : e);
  }
  await db.deleteFrom("gocardlessConnection").where("businessId", "=", businessId).execute();
}

export async function gcStatus(businessId: number) {
  const c = await db
    .selectFrom("gocardlessConnection")
    .select(["organisationId", "creditorName", "email", "livemode", "connectedAt"])
    .where("businessId", "=", businessId)
    .executeTakeFirst();
  const mandates = await db
    .selectFrom("clients")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("businessId", "=", businessId)
    .where("gcMandateId", "is not", null)
    .executeTakeFirst();
  return {
    configured: isGcConfigured(),
    webhook: !!env().webhookSecret,
    sandbox: !env().live,
    connected: !!c,
    name: c ? c.creditorName || c.email || c.organisationId : null,
    livemode: c?.livemode ?? env().live,
    connectedAt: c?.connectedAt ?? null,
    mandates: Number(mandates?.n ?? 0),
  };
}

async function requireConn(businessId: number) {
  const c = await db.selectFrom("gocardlessConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!c) throw new Error("GoCardless isn't connected. Connect it in Settings first.");
  return c;
}

// ---------- direct debit for a job ----------

type Mandate = { id: string; status: string; links?: { customer?: string } };
type Payment = { id: string; status: string; amount: number };
type BillingRequest = { id: string; status: string; links?: { mandate_request_mandate?: string; customer?: string } };

export type DdState = {
  status: "none" | "setup_sent" | "pending" | "paid" | "failed";
  paymentStatus: string | null;
  setupUrl: string | null;
  hasMandate: boolean;
};

async function loadJob(businessId: number, jobId: number) {
  const job = await db.selectFrom("jobs").selectAll().where("id", "=", jobId).where("businessId", "=", businessId).executeTakeFirst();
  if (!job) throw new Error("Job not found");
  const client = job.clientId
    ? await db.selectFrom("clients").selectAll().where("id", "=", job.clientId).where("businessId", "=", businessId).executeTakeFirst()
    : undefined;
  return { job, client };
}

function stateOf(job: { status: string; gcPaymentId: string | null; gcPaymentStatus: string | null; gcFlowUrl: string | null; gcBillingRequestId: string | null }, hasMandate: boolean): DdState {
  if (job.status === "Paid") return { status: "paid", paymentStatus: job.gcPaymentStatus, setupUrl: null, hasMandate };
  if (job.gcPaymentId) {
    const failed = DEAD_PAYMENT.includes(job.gcPaymentStatus ?? "");
    return { status: failed ? "failed" : "pending", paymentStatus: job.gcPaymentStatus, setupUrl: null, hasMandate };
  }
  if (job.gcBillingRequestId && job.gcFlowUrl) return { status: "setup_sent", paymentStatus: null, setupUrl: job.gcFlowUrl, hasMandate };
  return { status: "none", paymentStatus: null, setupUrl: null, hasMandate };
}

/** Returns a usable mandate id for the client, checking it's still live with GoCardless. */
async function liveMandate(token: string, client: { id: number; gcMandateId: string | null } | undefined) {
  if (!client?.gcMandateId) return null;
  try {
    const { mandates } = await gc<{ mandates: Mandate }>(`/mandates/${client.gcMandateId}`, token);
    await db.updateTable("clients").set({ gcMandateStatus: mandates.status }).where("id", "=", client.id).execute();
    if (LIVE_MANDATE.includes(mandates.status)) return mandates.id;
  } catch {
    /* treat as unusable */
  }
  await db.updateTable("clients").set({ gcMandateId: null, gcMandateStatus: null }).where("id", "=", client.id).execute();
  return null;
}

async function chargeJob(token: string, job: { id: number; num: string; service: string; price: string; gcPaymentId: string | null }, mandateId: string) {
  const amount = Math.round(Number(job.price) * 100);
  if (amount < 100) throw new Error("The job total must be at least $1.00 to charge by direct debit.");
  const inv = invoiceNumOf(job.num);
  const { payments } = await gc<{ payments: Payment }>("/payments", token, {
    method: "POST",
    idempotencyKey: `job-${job.id}-${job.gcPaymentId ?? "first"}-${amount}`,
    body: { payments: { amount, currency: "AUD", description: `${inv} · ${job.service || "Service"}`.slice(0, 100), links: { mandate: mandateId }, metadata: { job_id: String(job.id) } } },
  });
  await db
    .updateTable("jobs")
    .set({ gcPaymentId: payments.id, gcPaymentStatus: payments.status, gcAmount: amount / 100, payMethod: "online", payState: "awaiting", payProvider: "gocardless" })
    .where("id", "=", job.id)
    .execute();
  return payments;
}

/**
 * Collects a job by direct debit: charges the client's existing mandate, or returns a
 * GoCardless page where the customer sets up direct debit (the job is charged once they do).
 */
export async function startJobDirectDebit(businessId: number, jobId: number): Promise<DdState> {
  const conn = await requireConn(businessId);
  const { job, client } = await loadJob(businessId, jobId);
  if (job.status === "Paid") throw new Error("This job is already paid.");
  if (job.gcPaymentId && !DEAD_PAYMENT.includes(job.gcPaymentStatus ?? "")) {
    return stateOf(job, !!client?.gcMandateId);
  }
  const mandate = await liveMandate(conn.accessToken, client);
  if (mandate) {
    await chargeJob(conn.accessToken, job, mandate);
    const fresh = (await loadJob(businessId, jobId)).job;
    return stateOf(fresh, true);
  }
  // No mandate yet: reuse a pending billing request, or start one.
  let brId = job.gcBillingRequestId;
  if (brId) {
    const { billing_requests } = await gc<{ billing_requests: BillingRequest }>(`/billing_requests/${brId}`, conn.accessToken).catch(() => ({ billing_requests: null as unknown as BillingRequest }));
    if (billing_requests?.status === "fulfilled") {
      await syncGcJob(businessId, jobId);
      return stateOf((await loadJob(businessId, jobId)).job, true);
    }
    if (!billing_requests || !["pending", "ready_to_fulfil"].includes(billing_requests.status)) brId = null;
  }
  const inv = invoiceNumOf(job.num);
  if (!brId) {
    const { billing_requests } = await gc<{ billing_requests: BillingRequest }>("/billing_requests", conn.accessToken, {
      method: "POST",
      idempotencyKey: `br-job-${job.id}-${Date.now()}`,
      body: {
        billing_requests: {
          mandate_request: { scheme: "becs", currency: "AUD", description: `Direct debit for ${inv} and future services` },
          metadata: { job_id: String(job.id) },
          ...(client?.gcCustomerId ? { links: { customer: client.gcCustomerId } } : {}),
        },
      },
    });
    brId = billing_requests.id;
  }
  const [given, ...rest] = (client?.name || job.customer).trim().split(/\s+/);
  const back = `${PUBLIC_APP_URL}/i/${job.publicToken}`;
  const { billing_request_flows } = await gc<{ billing_request_flows: { authorisation_url: string } }>("/billing_request_flows", conn.accessToken, {
    method: "POST",
    body: {
      billing_request_flows: {
        redirect_uri: `${back}?dd=done`,
        exit_uri: back,
        links: { billing_request: brId },
        ...(client?.gcCustomerId
          ? {}
          : { prefilled_customer: { given_name: given || undefined, family_name: rest.join(" ") || undefined, email: client?.email || undefined } }),
      },
    },
  });
  await db
    .updateTable("jobs")
    .set({ gcBillingRequestId: brId, gcFlowUrl: billing_request_flows.authorisation_url, payMethod: "online", payState: "awaiting", payProvider: "gocardless" })
    .where("id", "=", job.id)
    .execute();
  return stateOf((await loadJob(businessId, jobId)).job, false);
}

/** Re-reads a job's direct debit from GoCardless: charges once set up, marks paid when confirmed. */
export async function syncGcJob(businessId: number, jobId: number): Promise<DdState> {
  const conn = await requireConn(businessId);
  const { job, client } = await loadJob(businessId, jobId);
  if (job.status === "Paid") return stateOf(job, !!client?.gcMandateId);
  if (job.gcPaymentId) {
    const { payments } = await gc<{ payments: Payment }>(`/payments/${job.gcPaymentId}`, conn.accessToken);
    await db.updateTable("jobs").set({ gcPaymentStatus: payments.status }).where("id", "=", job.id).execute();
    if (payments.status === "confirmed" || payments.status === "paid_out") await markJobPaidOnline(job.id, "gocardless");
  } else if (job.gcBillingRequestId) {
    const { billing_requests } = await gc<{ billing_requests: BillingRequest }>(`/billing_requests/${job.gcBillingRequestId}`, conn.accessToken);
    const mandateId = billing_requests.links?.mandate_request_mandate;
    if (billing_requests.status === "fulfilled" && mandateId) {
      if (client) {
        await db
          .updateTable("clients")
          .set({ gcMandateId: mandateId, gcCustomerId: billing_requests.links?.customer ?? client.gcCustomerId, gcMandateStatus: "pending_submission" })
          .where("id", "=", client.id)
          .execute();
      }
      await chargeJob(conn.accessToken, job, mandateId);
    }
  }
  const fresh = await loadJob(businessId, jobId);
  return stateOf(fresh.job, !!fresh.client?.gcMandateId);
}

export async function ddStateFor(businessId: number, jobId: number) {
  const { job, client } = await loadJob(businessId, jobId);
  return stateOf(job, !!client?.gcMandateId);
}

// ---------- webhook ----------

export function verifyGcSignature(raw: string, header: string | null) {
  const secret = env().webhookSecret;
  if (!secret) throw new Error("GoCardless webhook secret isn't configured.");
  if (!header) throw new Error("Missing Webhook-Signature");
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid GoCardless signature");
}

type GcEvent = { id: string; resource_type: string; action: string; links?: Record<string, string | undefined> };

export async function handleGcEvents(events: GcEvent[]) {
  for (const ev of events.slice(0, 250)) {
    try {
      const orgId = ev.links?.organisation;
      if (!orgId) continue;
      const conn = await db.selectFrom("gocardlessConnection").select("businessId").where("organisationId", "=", orgId).executeTakeFirst();
      if (!conn) continue;
      const biz = conn.businessId;
      if (ev.resource_type === "organisations" && ev.action === "disconnected") {
        await db.deleteFrom("gocardlessConnection").where("businessId", "=", biz).execute();
      } else if (ev.resource_type === "billing_requests" && ev.links?.billing_request) {
        const job = await db.selectFrom("jobs").select("id").where("businessId", "=", biz).where("gcBillingRequestId", "=", ev.links.billing_request).executeTakeFirst();
        if (job) await syncGcJob(biz, job.id);
      } else if (ev.resource_type === "payments" && ev.links?.payment) {
        const job = await db.selectFrom("jobs").select("id").where("businessId", "=", biz).where("gcPaymentId", "=", ev.links.payment).executeTakeFirst();
        if (job) await syncGcJob(biz, job.id);
      } else if (ev.resource_type === "mandates" && ev.links?.mandate) {
        const newId = ev.action === "replaced" ? ev.links.new_mandate : undefined;
        const dead = ["cancelled", "failed", "expired", "blocked", "consumed"].includes(ev.action);
        await db
          .updateTable("clients")
          .set(newId ? { gcMandateId: newId, gcMandateStatus: "active" } : dead ? { gcMandateId: null, gcMandateStatus: ev.action } : { gcMandateStatus: ev.action })
          .where("businessId", "=", biz)
          .where("gcMandateId", "=", ev.links.mandate)
          .execute();
      }
    } catch (e) {
      console.error("GoCardless event failed", ev.id, e instanceof Error ? e.message : e);
    }
  }
}

/** Catch-up for businesses without webhooks: re-checks recent pending direct debits. */
export async function syncPendingGc(businessId: number) {
  const conn = await db.selectFrom("gocardlessConnection").select("businessId").where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) return 0;
  const jobs = await db
    .selectFrom("jobs")
    .select("id")
    .where("businessId", "=", businessId)
    .where("status", "!=", "Paid")
    .where("payProvider", "=", "gocardless")
    .where((eb) => eb.or([eb("gcPaymentId", "is not", null), eb("gcBillingRequestId", "is not", null)]))
    .orderBy("id", "desc")
    .limit(15)
    .execute();
  let n = 0;
  for (const j of jobs) {
    const before = await ddStateFor(businessId, j.id);
    if (before.status === "failed") continue;
    const after = await syncGcJob(businessId, j.id).catch(() => before);
    if (after.status !== before.status || after.paymentStatus !== before.paymentStatus) n++;
  }
  return n;
}
