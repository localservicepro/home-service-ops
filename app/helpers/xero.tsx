import { randomBytes } from "node:crypto";
import { db } from "./db";
import { PUBLIC_APP_URL } from "./mailer";
import { invoiceNumOf } from "./onlinePay";
import { API_URL } from "./serverEnv";

// Server-only. Xero: each business connects its own organisation (OAuth 2 code flow).
// Paid jobs become an AUTHORISED sales invoice (ACCREC) with the payment applied, so they
// show as paid in Xero. Only jobs paid after Xero was connected are sent automatically.

export const XERO_CALLBACK_PATH = "/xero/callback";
const AUTH = "https://login.xero.com/identity/connect/authorize";
const TOKEN = "https://identity.xero.com/connect/token";
const API = "https://api.xero.com/api.xro/2.0";
// Granular scopes (Xero apps created after March 2026).
const SCOPES = "openid profile email offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read";
const STATE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function env() {
  const e = process.env as Record<string, string | undefined>;
  return { id: e.XERO_CLIENT_ID?.trim(), secret: e.XERO_CLIENT_SECRET?.trim() };
}
export const isXeroConfigured = () => !!env().id && !!env().secret;
function creds() {
  const { id, secret } = env();
  if (!id || !secret) throw new Error("Xero isn't set up for this app yet.");
  return { id, secret };
}
const redirectUri = () => `${API_URL}${XERO_CALLBACK_PATH}`;

type TokenRes = { access_token: string; refresh_token: string; expires_in: number };

async function tokenCall(body: Record<string, string>): Promise<TokenRes> {
  const { id, secret } = creds();
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenRes & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(`Xero: ${json.error_description || json.error || `sign-in failed (${res.status})`}`);
  return json;
}

// ---------- connect ----------

export async function startXeroAuth(businessId: number) {
  const { id } = creds();
  const state = randomBytes(24).toString("hex");
  await db.deleteFrom("xeroOauthStates").where("createdAt", "<", new Date(Date.now() - STATE_TTL_MS)).execute();
  await db.insertInto("xeroOauthStates").values({ state, businessId }).execute();
  const q = new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: redirectUri(), scope: SCOPES, state });
  return { authorizeUrl: `${AUTH}?${q.toString()}` };
}

type Conn = { id: string; tenantId: string; tenantType: string; tenantName: string; createdDateUtc: string };

export async function finishXeroAuth(code: string, state: string) {
  const row = await db.deleteFrom("xeroOauthStates").where("state", "=", state).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - STATE_TTL_MS) throw new Error("This connection link has expired. Please try connecting again.");
  const tok = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  const res = await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" } });
  const conns = ((await res.json().catch(() => [])) as Conn[]).filter((c) => c.tenantType === "ORGANISATION");
  if (!conns.length) throw new Error("No Xero organisation was selected.");
  // The organisation just authorised is the most recently created connection.
  const c = conns.sort((a, b) => b.createdDateUtc.localeCompare(a.createdDateUtc))[0];
  const values = {
    tenantId: c.tenantId,
    connectionId: c.id,
    orgName: c.tenantName || "Xero organisation",
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: new Date(Date.now() + (tok.expires_in - 60) * 1000),
    lastError: null,
  };
  const prev = await db.selectFrom("xeroConnection").select("tenantId").where("businessId", "=", row.businessId).executeTakeFirst();
  const reset = prev && prev.tenantId !== c.tenantId ? { salesAccountCode: null, bankAccountId: null, bankAccountName: null } : {};
  await db
    .insertInto("xeroConnection")
    .values({ businessId: row.businessId, ...values, connectedAt: new Date() })
    .onConflict((oc) => oc.column("businessId").doUpdateSet({ ...values, ...reset, connectedAt: new Date() }))
    .execute();
  // Contact ids belong to one organisation; forget them if the organisation changed.
  if (prev && prev.tenantId !== c.tenantId) {
    await db.updateTable("clients").set({ xeroContactId: null }).where("businessId", "=", row.businessId).execute();
  }
  return { name: values.orgName };
}

export async function disconnectXero(businessId: number) {
  const c = await db.selectFrom("xeroConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!c) return;
  try {
    const token = await accessToken(businessId);
    if (c.connectionId) await fetch(`https://api.xero.com/connections/${c.connectionId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* disconnect locally regardless */
  }
  await db.deleteFrom("xeroConnection").where("businessId", "=", businessId).execute();
}

async function accessToken(businessId: number) {
  const c = await db.selectFrom("xeroConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!c) throw new Error("Xero isn't connected.");
  if (c.expiresAt.getTime() > Date.now() + 30_000) return c.accessToken;
  const tok = await tokenCall({ grant_type: "refresh_token", refresh_token: c.refreshToken });
  await db
    .updateTable("xeroConnection")
    .set({ accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresAt: new Date(Date.now() + (tok.expires_in - 60) * 1000) })
    .where("businessId", "=", businessId)
    .execute();
  return tok.access_token;
}

type XeroErr = { Message?: string; Detail?: string; Elements?: { ValidationErrors?: { Message: string }[] }[]; Title?: string };

async function xero<T>(businessId: number, path: string, opts: { method?: string; body?: unknown; idem?: string } = {}): Promise<T> {
  const c = await db.selectFrom("xeroConnection").select("tenantId").where("businessId", "=", businessId).executeTakeFirstOrThrow();
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken(businessId)}`,
      "xero-tenant-id": c.tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.idem ? { "Idempotency-Key": opts.idem } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = (await res.json().catch(() => ({}))) as T & XeroErr;
  if (!res.ok) {
    const v = json.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).join("; ");
    const msg = v || json.Detail || json.Message || json.Title;
    if (res.status === 401 || res.status === 403) throw new Error("Xero access was removed. Please reconnect Xero in Settings.");
    if (res.status === 429) throw new Error("Xero is busy (rate limit). It will retry shortly.");
    throw new Error(`Xero: ${msg ?? `request failed (${res.status})`}`);
  }
  return json;
}

// ---------- settings ----------

type Account = { AccountID: string; Code?: string; Name: string; Type: string; Status: string; EnablePaymentsToAccount?: boolean };

export async function xeroStatus(businessId: number, withAccounts: boolean) {
  const c = await db.selectFrom("xeroConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  const counts = c
    ? await db
        .selectFrom("jobs")
        .select((eb) => [
          eb.fn.count<string>("id").filterWhere("xeroStatus", "=", "paid").as("synced"),
          eb.fn.count<string>("id").filterWhere("xeroStatus", "in", ["failed", "invoiced"]).as("problems"),
        ])
        .where("businessId", "=", businessId)
        .executeTakeFirst()
    : null;
  let accounts: { sales: { code: string; name: string }[]; bank: { id: string; name: string }[] } | null = null;
  let error = c?.lastError ?? null;
  if (c && withAccounts) {
    try {
      const r = await xero<{ Accounts: Account[] }>(businessId, "/Accounts");
      const active = r.Accounts.filter((a) => a.Status === "ACTIVE");
      accounts = {
        sales: active.filter((a) => (a.Type === "REVENUE" || a.Type === "SALES") && a.Code).map((a) => ({ code: a.Code!, name: `${a.Code} · ${a.Name}` })),
        bank: active.filter((a) => a.Type === "BANK" || a.EnablePaymentsToAccount).map((a) => ({ id: a.AccountID, name: a.Code ? `${a.Code} · ${a.Name}` : a.Name })),
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    configured: isXeroConfigured(),
    connected: !!c,
    orgName: c?.orgName ?? null,
    autoSync: c?.autoSync ?? true,
    invoiceMode: (c?.invoiceMode === "paid" ? "paid" : "invoice") as "paid" | "invoice",
    emailInvoices: c?.emailInvoices ?? true,
    webhook: !!(process.env as Record<string, string | undefined>).XERO_WEBHOOK_KEY?.trim(),
    salesAccountCode: c?.salesAccountCode ?? null,
    bankAccountId: c?.bankAccountId ?? null,
    bankAccountName: c?.bankAccountName ?? null,
    lastSyncAt: c?.lastSyncAt ?? null,
    lastError: error,
    synced: Number(counts?.synced ?? 0),
    problems: Number(counts?.problems ?? 0),
    accounts,
  };
}

export async function updateXeroSettings(
  businessId: number,
  patch: { autoSync?: boolean; salesAccountCode?: string | null; bankAccountId?: string | null; bankAccountName?: string | null; invoiceMode?: "paid" | "invoice"; emailInvoices?: boolean },
) {
  const set: typeof patch & { modeChangedAt?: Date } = { ...patch };
  if (patch.invoiceMode) {
    const cur = await db.selectFrom("xeroConnection").select("invoiceMode").where("businessId", "=", businessId).executeTakeFirst();
    // Only jobs finished after switching to invoice mode are invoiced automatically.
    if (cur && cur.invoiceMode !== patch.invoiceMode) set.modeChangedAt = new Date();
  }
  const r = await db.updateTable("xeroConnection").set(set).where("businessId", "=", businessId).executeTakeFirst();
  if (!Number(r.numUpdatedRows)) throw new Error("Xero isn't connected.");
}

// ---------- pushing paid jobs ----------

type Line = { name: string; qty: number | string; price: number | string };
type Contact = { ContactID: string; Name: string; EmailAddress?: string };
type Invoice = { InvoiceID: string; InvoiceNumber: string; Status: string; Total: number; AmountDue: number; AmountPaid: number };

async function contactFor(businessId: number, job: { clientId: number | null; customer: string; phone: string; address: string }) {
  const client = job.clientId
    ? await db.selectFrom("clients").select(["id", "name", "email", "phone", "xeroContactId"]).where("id", "=", job.clientId).executeTakeFirst()
    : undefined;
  if (client?.xeroContactId) return client.xeroContactId;
  const name = (client?.name || job.customer || "Customer").trim().slice(0, 255);
  const email = client?.email?.trim() || "";
  const found = await xero<{ Contacts: Contact[] }>(businessId, `/Contacts?searchTerm=${encodeURIComponent(email || name)}&summaryOnly=true`);
  const match =
    found.Contacts.find((c) => email && c.EmailAddress?.toLowerCase() === email.toLowerCase()) ??
    found.Contacts.find((c) => c.Name.trim().toLowerCase() === name.toLowerCase());
  let id = match?.ContactID;
  if (!id) {
    const created = await xero<{ Contacts: Contact[] }>(businessId, "/Contacts", {
      method: "POST",
      body: {
        Contacts: [
          {
            Name: name,
            ...(email ? { EmailAddress: email } : {}),
            ...(client?.phone || job.phone ? { Phones: [{ PhoneType: "MOBILE", PhoneNumber: client?.phone || job.phone }] } : {}),
            ...(job.address ? { Addresses: [{ AddressType: "STREET", AddressLine1: job.address.slice(0, 500) }] } : {}),
          },
        ],
      },
    });
    id = created.Contacts[0].ContactID;
  }
  if (client) await db.updateTable("clients").set({ xeroContactId: id }).where("id", "=", client.id).execute();
  return id;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
};

type JobRow = Awaited<ReturnType<typeof loadJob>>;
const loadJob = (businessId: number, jobId: number) =>
  db.selectFrom("jobs").selectAll().where("id", "=", jobId).where("businessId", "=", businessId).executeTakeFirstOrThrow();

/** Creates an AUTHORISED sales invoice for a job. dueDays = payment terms (0 = due on the invoice date). */
async function createInvoice(businessId: number, job: JobRow, salesAccountCode: string | null, dueDays: number) {
  if (!salesAccountCode) throw new Error("Choose a sales account in Settings → Xero.");
  const lines = (Array.isArray(job.lines) ? (job.lines as Line[]) : []).filter((l) => l && l.name);
  const tax = job.gst ? { TaxType: "OUTPUT" } : {};
  const acct = { AccountCode: salesAccountCode };
  const items = lines.length
    ? lines.map((l) => ({ Description: l.name.slice(0, 4000), Quantity: Math.max(1, parseInt(String(l.qty), 10) || 1), UnitAmount: num(l.price), ...acct, ...tax }))
    : [{ Description: job.service || "Service", Quantity: 1, UnitAmount: job.gst ? Math.round((num(job.price) / 1.1) * 100) / 100 : num(job.price), ...acct, ...tax }];
  const disc = lines.length ? num(job.discount) : 0;
  if (disc > 0) items.push({ Description: "Discount", Quantity: 1, UnitAmount: -disc, ...acct, ...tax });
  const d = job.scheduledDate ?? job.statusChangedAt;
  const created = await xero<{ Invoices: Invoice[] }>(businessId, "/Invoices", {
    method: "POST",
    idem: `hso-inv-${businessId}-${job.id}`,
    body: {
      Invoices: [
        {
          Type: "ACCREC",
          Contact: { ContactID: await contactFor(businessId, job) },
          Date: ymd(d),
          DueDate: ymd(new Date(Math.max(d.getTime(), Date.now()) + dueDays * 86_400_000)),
          InvoiceNumber: invoiceNumOf(job.num),
          Reference: [job.num, job.service].filter(Boolean).join(" · ").slice(0, 255),
          LineAmountTypes: job.gst ? "Exclusive" : "NoTax",
          Status: "AUTHORISED",
          LineItems: items,
        },
      ],
    },
  });
  return created.Invoices[0];
}

/**
 * Invoice mode: a finished (Done) job gets its invoice raised in Xero, optionally emailed by Xero,
 * and the customer pays it there. Payment in Xero flips the job to Paid (webhook or polling).
 */
export async function invoiceJobInXero(businessId: number, jobId: number) {
  const conn = await db.selectFrom("xeroConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) throw new Error("Connect Xero in Settings first.");
  const job = await loadJob(businessId, jobId);
  if (job.status !== "Done" && job.status !== "Paid") throw new Error("Only finished jobs can be invoiced.");
  if (job.status === "Paid") return pushJobToXero(businessId, jobId);
  try {
    let invoiceId = job.xeroInvoiceId;
    if (!invoiceId) {
      const existing = await xero<{ Invoices: Invoice[] }>(businessId, `/Invoices?InvoiceNumbers=${encodeURIComponent(invoiceNumOf(job.num))}&Statuses=DRAFT,SUBMITTED,AUTHORISED,PAID`);
      const inv = existing.Invoices[0] ?? (await createInvoice(businessId, job, conn.salesAccountCode, 7));
      invoiceId = inv.InvoiceID;
      await db.updateTable("jobs").set({ xeroInvoiceId: invoiceId, xeroStatus: "awaiting", xeroError: null, xeroSyncedAt: new Date() }).where("id", "=", jobId).execute();
    }
    let url = job.xeroOnlineUrl;
    if (!url) {
      try {
        const o = await xero<{ OnlineInvoices: { OnlineInvoiceUrl: string }[] }>(businessId, `/Invoices/${invoiceId}/OnlineInvoice`);
        url = o.OnlineInvoices[0]?.OnlineInvoiceUrl ?? null;
        if (url) await db.updateTable("jobs").set({ xeroOnlineUrl: url }).where("id", "=", jobId).execute();
      } catch {
        /* link is a nice-to-have */
      }
    }
    let emailed = false;
    if (conn.emailInvoices && !job.xeroOnlineUrl) {
      const client = job.clientId ? await db.selectFrom("clients").select("email").where("id", "=", job.clientId).executeTakeFirst() : undefined;
      if (client?.email?.includes("@")) {
        await xero(businessId, `/Invoices/${invoiceId}/Email`, { method: "POST", body: {} });
        emailed = true;
        await db.updateTable("jobs").set({ invoiceSentAt: new Date(), invoiceSentTo: client.email }).where("id", "=", jobId).execute();
      }
    }
    await db.updateTable("xeroConnection").set({ lastSyncAt: new Date(), lastError: null }).where("businessId", "=", businessId).execute();
    return { status: "awaiting" as const, url, emailed };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db
      .updateTable("jobs")
      .set({ xeroStatus: job.xeroInvoiceId ? "awaiting" : "failed", xeroError: msg, xeroAttempts: job.xeroAttempts + 1, xeroSyncedAt: new Date() })
      .where("id", "=", jobId)
      .execute();
    await db.updateTable("xeroConnection").set({ lastError: msg }).where("businessId", "=", businessId).execute();
    throw new Error(msg);
  }
}

/** Invoice mode: checks awaiting Xero invoices and marks jobs paid when Xero says PAID. */
export async function checkXeroInvoices(businessId: number, jobIds?: number[]) {
  let q = db
    .selectFrom("jobs")
    .select(["id", "xeroInvoiceId"])
    .where("businessId", "=", businessId)
    .where("status", "=", "Done")
    .where("xeroInvoiceId", "is not", null);
  if (jobIds?.length) q = q.where("id", "in", jobIds);
  const jobs = await q.orderBy("xeroSyncedAt").limit(40).execute();
  if (!jobs.length) return 0;
  const r = await xero<{ Invoices: Invoice[] }>(businessId, `/Invoices?IDs=${jobs.map((j) => j.xeroInvoiceId).join(",")}&summaryOnly=true`);
  const byId = new Map(r.Invoices.map((i) => [i.InvoiceID, i]));
  const { markJobPaidOnline } = await import("./onlinePay");
  let n = 0;
  for (const j of jobs) {
    const inv = byId.get(j.xeroInvoiceId!);
    if (inv && (inv.Status === "PAID" || (inv.AmountDue <= 0 && inv.AmountPaid > 0))) {
      await db.updateTable("jobs").set({ xeroPaymentId: "in-xero", xeroStatus: "paid", xeroError: null, xeroSyncedAt: new Date() }).where("id", "=", j.id).execute();
      if (await markJobPaidOnline(j.id, "xero")) n++;
    } else {
      await db.updateTable("jobs").set({ xeroSyncedAt: new Date() }).where("id", "=", j.id).execute();
    }
  }
  return n;
}

/** Xero webhook: invoice events for any connected organisation. */
export async function handleXeroInvoiceEvents(events: { resourceId: string; tenantId: string; eventCategory: string }[]) {
  const byBiz = new Map<number, number[]>();
  for (const e of events) {
    if (e.eventCategory !== "INVOICE") continue;
    const job = await db
      .selectFrom("jobs")
      .innerJoin("xeroConnection", "xeroConnection.businessId", "jobs.businessId")
      .select(["jobs.id", "jobs.businessId"])
      .where("jobs.xeroInvoiceId", "=", e.resourceId)
      .where("xeroConnection.tenantId", "=", e.tenantId)
      .where("jobs.status", "=", "Done")
      .executeTakeFirst();
    if (job) byBiz.set(job.businessId, [...(byBiz.get(job.businessId) ?? []), job.id]);
  }
  for (const [biz, ids] of byBiz) await checkXeroInvoices(biz, ids).catch(() => 0);
}

/** Sends one paid job to Xero: invoice (if not already there) + payment. Idempotent. */
export async function pushJobToXero(businessId: number, jobId: number) {
  const conn = await db.selectFrom("xeroConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) throw new Error("Connect Xero in Settings first.");
  const job = await db.selectFrom("jobs").selectAll().where("id", "=", jobId).where("businessId", "=", businessId).executeTakeFirst();
  if (!job) throw new Error("Job not found");
  if (job.status !== "Paid") throw new Error("Only paid jobs are sent to Xero.");
  if (job.xeroPaymentId) return { status: "paid" as const };

  const fail = async (e: unknown, status = "failed") => {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db
      .updateTable("jobs")
      .set({ xeroStatus: status, xeroError: msg, xeroAttempts: job.xeroAttempts + 1, xeroSyncedAt: new Date() })
      .where("id", "=", jobId)
      .execute();
    await db.updateTable("xeroConnection").set({ lastError: msg }).where("businessId", "=", businessId).execute();
    return msg;
  };

  try {
    const invNum = invoiceNumOf(job.num);
    let invoiceId = job.xeroInvoiceId;
    let invoice: Invoice | undefined;

    if (!invoiceId) {
      // Re-use an invoice with the same number if one is already in Xero (e.g. created by hand).
      const existing = await xero<{ Invoices: Invoice[] }>(businessId, `/Invoices?InvoiceNumbers=${encodeURIComponent(invNum)}&Statuses=DRAFT,SUBMITTED,AUTHORISED,PAID`);
      invoice = existing.Invoices[0];
      if (!invoice) invoice = await createInvoice(businessId, job, conn.salesAccountCode, 0);
      invoiceId = invoice.InvoiceID;
      await db.updateTable("jobs").set({ xeroInvoiceId: invoiceId, xeroStatus: "invoiced", xeroError: null }).where("id", "=", jobId).execute();
    }

    if (!invoice) {
      const r = await xero<{ Invoices: Invoice[] }>(businessId, `/Invoices/${invoiceId}`);
      invoice = r.Invoices[0];
    }
    if (invoice.Status === "PAID" || invoice.AmountDue <= 0) {
      await db.updateTable("jobs").set({ xeroPaymentId: "already-paid", xeroStatus: "paid", xeroError: null, xeroSyncedAt: new Date() }).where("id", "=", jobId).execute();
    } else {
      if (!conn.bankAccountId) {
        await fail(new Error("Invoice created — choose a 'payments received into' account in Settings → Xero to mark it paid."), "invoiced");
        return { status: "invoiced" as const };
      }
      const pay = await xero<{ Payments: { PaymentID: string }[] }>(businessId, "/Payments", {
        method: "PUT",
        idem: `hso-pay-${businessId}-${job.id}`,
        body: {
          Invoice: { InvoiceID: invoiceId },
          Account: { AccountID: conn.bankAccountId },
          Date: ymd(job.statusChangedAt),
          Amount: invoice.AmountDue,
          Reference: [job.payProvider || job.payMethod || "", job.num].filter(Boolean).join(" · ").slice(0, 255),
        },
      });
      await db
        .updateTable("jobs")
        .set({ xeroPaymentId: pay.Payments[0].PaymentID, xeroStatus: "paid", xeroError: null, xeroSyncedAt: new Date() })
        .where("id", "=", jobId)
        .execute();
    }
    await db.updateTable("xeroConnection").set({ lastSyncAt: new Date(), lastError: null }).where("businessId", "=", businessId).execute();
    return { status: "paid" as const };
  } catch (e) {
    const msg = await fail(e);
    throw new Error(msg);
  }
}

/** Sends paid jobs that are waiting (auto-sync). Safe to call often; a few per call to respect Xero's rate limit. */
export async function syncPaidJobsToXero(businessId: number) {
  if (!isXeroConfigured()) return 0;
  const conn = await db
    .selectFrom("xeroConnection")
    .select(["autoSync", "connectedAt", "invoiceMode", "modeChangedAt"])
    .where("businessId", "=", businessId)
    .executeTakeFirst();
  if (!conn?.autoSync) return 0;
  const since = conn.modeChangedAt && conn.modeChangedAt > conn.connectedAt ? conn.modeChangedAt : conn.connectedAt;
  let n = 0;

  if (conn.invoiceMode === "invoice") {
    // 1) Raise invoices in Xero for newly finished jobs.
    const done = await db
      .selectFrom("jobs")
      .select("id")
      .where("businessId", "=", businessId)
      .where("status", "=", "Done")
      .where("xeroInvoiceId", "is", null)
      .where("xeroAttempts", "<", MAX_ATTEMPTS)
      .where("statusChangedAt", ">=", since)
      .orderBy("statusChangedAt")
      .limit(5)
      .execute();
    for (const j of done) {
      try {
        await invoiceJobInXero(businessId, j.id);
        n++;
      } catch {
        /* recorded on the job */
      }
    }
    // 2) Catch payments made in Xero (backup for the webhook).
    n += await checkXeroInvoices(businessId).catch(() => 0);
  }

  // Jobs marked paid in the app (cash, card, bank…) → invoice + payment in Xero.
  const jobs = await db
    .selectFrom("jobs")
    .select("id")
    .where("businessId", "=", businessId)
    .where("status", "=", "Paid")
    .where("xeroPaymentId", "is", null)
    .where("xeroAttempts", "<", MAX_ATTEMPTS)
    .where((eb) => eb.or([eb("statusChangedAt", ">=", conn.connectedAt), eb("xeroInvoiceId", "is not", null)]))
    .orderBy("statusChangedAt")
    .limit(5)
    .execute();
  for (const j of jobs) {
    try {
      await pushJobToXero(businessId, j.id);
      n++;
    } catch {
      /* recorded on the job */
    }
  }
  return n;
}

export async function maybeSyncXero(businessId: number) {
  await syncPaidJobsToXero(businessId).catch(() => 0);
}

