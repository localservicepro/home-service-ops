import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { db } from "./db";
import type { DB, Json } from "./schema";
import { env } from "./serverEnv";
import { sendAppEmail, EmailNotConfiguredError } from "./mailer";
import { isStripeConfigured, stripeApi } from "./stripeConnect";
import {
  ALERT_AFTER,
  MAX_BATCH,
  SALES_BRAIN_URL,
  accountData,
  accountFingerprint,
  batchBody,
  classifyResponse,
  paymentFromInvoice,
  paymentFromRefund,
  retryDelayMs,
  signedHeaders,
  ticketData,
  type AccountSource,
  type SbEvent,
  type SbEventType,
  type StripeInvoiceLite,
  type StripeRefundLite,
} from "./salesBrainEvents";

// Server-only. Pushes account, payment and ticket changes to Sales Brain (Local Service Pro's
// operations app) through an outbox:
//  - The change and its event are written in the same transaction (enqueue / queue* below), with
//    the event id fixed at that point, so a retry is always the same event.
//  - processOutbox() runs every minute from pg_cron (/cron/salesbrain) and sends due events in
//    signed batches of up to 500. Nothing a user does ever waits on Sales Brain.
// The shared secret is LSP_APP_SHARED_SECRET (a Supabase secret). It is never logged or returned.

type Exec = Kysely<DB>;

const secret = () => env("LSP_APP_SHARED_SECRET");
export const isSalesBrainConfigured = () => !!secret();
const alertEmail = () => env("SALES_BRAIN_ALERT_EMAIL") || "info@localservicepro.com.au";

export const newEventId = () => `evt_${randomUUID()}`;
/** YYYY-MM-DD in Brisbane, for once-a-day event ids. */
export const brisbaneDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(d);

// ---------- writing events (call inside the transaction that made the change) ----------

export async function enqueue(exec: Exec, events: { id?: string; type: SbEventType; occurredAt?: Date; data: Record<string, unknown> }[]) {
  if (!events.length) return;
  const rows = events.map((e) => {
    const event: SbEvent = { id: e.id ?? newEventId(), type: e.type, occurred_at: (e.occurredAt ?? new Date()).toISOString(), data: e.data };
    return { id: event.id, type: event.type, payload: event as unknown as Json };
  });
  await exec
    .insertInto("salesbrainOutbox")
    .values(rows)
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();
}

async function loadAccount(exec: Exec, businessId: number): Promise<(AccountSource & { fingerprint: string | null }) | null> {
  const b = await exec.selectFrom("businesses").selectAll().where("id", "=", businessId).executeTakeFirst();
  if (!b) return null;
  const owner = await exec
    .selectFrom("memberships")
    .innerJoin("users", "users.id", "memberships.userId")
    .select(["users.displayName", "users.email"])
    .where("memberships.businessId", "=", businessId)
    .where("memberships.role", "=", "owner")
    .orderBy("memberships.id")
    .executeTakeFirst();
  const s = await exec.selectFrom("settings").select(["owner", "business"]).where("businessId", "=", businessId).executeTakeFirst();
  const o = (s?.owner ?? {}) as { first?: string; last?: string; email?: string; phone?: string };
  const biz = (s?.business ?? {}) as { email?: string; phone?: string };
  const since = new Date(Date.now() - 30 * 86_400_000);
  const jobs = await exec
    .selectFrom("jobs")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("businessId", "=", businessId)
    .where("status", "!=", "Cancelled")
    .where("scheduledDate", ">=", since)
    .where("scheduledDate", "<=", new Date())
    .executeTakeFirstOrThrow();
  const users = await exec
    .selectFrom("memberships")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("businessId", "=", businessId)
    .executeTakeFirstOrThrow();
  return {
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    plan: b.plan,
    comp: b.comp,
    trialEndsAt: b.trialEndsAt,
    subscriptionStatus: b.subscriptionStatus,
    cancelAtPeriodEnd: b.cancelAtPeriodEnd,
    cancelledAt: b.cancelledAt,
    cancelReason: b.cancelReason,
    lastActiveAt: b.lastActiveAt,
    lastInvoiceCents: b.lastInvoiceCents,
    ownerName: owner?.displayName || [o.first, o.last].filter(Boolean).join(" "),
    email: owner?.email || o.email || biz.email || "",
    phone: o.phone || biz.phone || "",
    jobsLast30d: Number(jobs.n),
    users: Number(users.n),
    fingerprint: b.sbFingerprint,
  };
}

/**
 * Queues the account's full current state when something Sales Brain cares about changed since
 * the last one (or always, with force). Returns whether an event was queued.
 */
export async function queueAccountSync(exec: Exec, businessId: number, opts: { force?: boolean; eventId?: string } = {}) {
  const src = await loadAccount(exec, businessId);
  if (!src) return false;
  const data = accountData(src);
  const fp = accountFingerprint(data);
  if (!opts.force && fp === src.fingerprint) return false;
  await enqueue(exec, [{ id: opts.eventId, type: "account.upserted", data }]);
  if (fp !== src.fingerprint) await exec.updateTable("businesses").set({ sbFingerprint: fp }).where("id", "=", businessId).execute();
  return true;
}

/** The last word on an account that's being deleted (call before deleting it, same transaction). */
export async function queueAccountClosed(exec: Exec, businessId: number) {
  const src = await loadAccount(exec, businessId);
  if (!src) return;
  const data = accountData(src);
  await enqueue(exec, [
    {
      type: "account.upserted",
      data: {
        ...data,
        status: "cancelled",
        mrr_cents: 0,
        cancelled_at: new Date().toISOString(),
        cancel_reason: (data.cancel_reason as string | null) ?? "Deleted their Home Service Ops account",
      },
    },
  ]);
}

export async function queueTicket(exec: Exec, ticketId: number) {
  const t = await exec.selectFrom("supportTickets").selectAll().where("id", "=", ticketId).executeTakeFirst();
  if (!t) return;
  await enqueue(exec, [{ type: "ticket.upserted", occurredAt: t.updatedAt, data: ticketData(t) }]);
}

/** Last activity per business, written at most every 10 minutes per worker. Never throws. */
const touched = new Map<number, number>();
export function touchActive(businessId: number) {
  const last = touched.get(businessId) ?? 0;
  if (Date.now() - last < 10 * 60_000) return;
  touched.set(businessId, Date.now());
  db.updateTable("businesses")
    .set({ lastActiveAt: new Date() })
    .where("id", "=", businessId)
    .execute()
    .catch(() => undefined);
}

// ---------- Stripe billing webhooks → payment.recorded ----------

type StripeEvent = { id: string; type: string; created: number; data: { object: Record<string, unknown> } };
type StripeCharge = { id: string; customer?: string | null; refunds?: { data?: StripeRefundLite[] } | null };

/**
 * Records a platform-billing payment (invoice.paid, invoice.payment_failed, charge.refunded) for
 * Sales Brain, keyed so that Stripe's own webhook retries can't send it twice.
 */
export async function recordBillingPayment(event: StripeEvent, businessId: number) {
  const obj = event.data.object;
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const inv = obj as unknown as StripeInvoiceLite & { customer?: string };
    const outcome = event.type === "invoice.paid" ? "paid" : "failed";
    await db.transaction().execute(async (trx) => {
      await enqueue(trx, [{ id: `stripe-${event.id}`, type: "payment.recorded", occurredAt: new Date(event.created * 1000), data: paymentFromInvoice(businessId, inv, outcome, event.created) }]);
      // A regular monthly charge is the best measure of what they pay (with GST, after discounts).
      if (outcome === "paid" && (inv.billing_reason === "subscription_cycle" || inv.billing_reason === "subscription_create") && (inv.amount_paid ?? 0) > 0) {
        await trx.updateTable("businesses").set({ lastInvoiceCents: inv.amount_paid! }).where("id", "=", businessId).execute();
      }
    });
    return;
  }
  if (event.type === "charge.refunded") {
    const charge = obj as unknown as StripeCharge;
    let refunds = charge.refunds?.data ?? [];
    if (!refunds.length && isStripeConfigured()) {
      refunds = (await stripeApi<{ data: StripeRefundLite[] }>("/refunds", { params: { charge: charge.id, limit: 20 } })).data;
    }
    await db.transaction().execute(async (trx) => {
      await enqueue(
        trx,
        refunds.map((r) => ({ id: `refund-${r.id}`, type: "payment.recorded" as const, occurredAt: new Date(r.created * 1000), data: paymentFromRefund(businessId, { ...r, charge: charge.id }) })),
      );
    });
  }
}

// ---------- sending ----------

type OutboxRow = { id: string; type: string; payload: SbEvent; attempts: number; createdAt: Date };

/** Takes due events, pushing their next attempt a few minutes out so a parallel run skips them. */
async function claim(limit: number, alone: boolean): Promise<OutboxRow[]> {
  // The payload comes back as text: the camelCase plugin would otherwise rename the keys inside
  // it (account_id → accountId) and Sales Brain would reject every event.
  const r = await sql<Omit<OutboxRow, "payload"> & { body: string }>`
    update hso.salesbrain_outbox o
       set next_attempt_at = now() + interval '3 minutes'
     where o.id in (
       select id from hso.salesbrain_outbox
        where status = 'pending' and next_attempt_at <= now() and send_alone = ${alone}
        order by created_at
        limit ${limit}
        for update skip locked)
    returning o.id, o.type, o.payload::text as body, o.attempts, o.created_at`.execute(db);
  return r.rows
    .map(({ body, ...row }) => ({ ...row, payload: JSON.parse(body) as SbEvent }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function post(body: string): Promise<{ status: number | null; json: unknown; error?: string }> {
  const key = secret();
  if (!key) return { status: null, json: null, error: "LSP_APP_SHARED_SECRET isn't set" };
  try {
    const res = await fetch(SALES_BRAIN_URL, { method: "POST", headers: signedHeaders(key, body), body, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      /* keep the text */
    }
    return { status: res.status, json };
  } catch (e) {
    return { status: null, json: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function alert(ids: string[], problem: string) {
  const recent = await db
    .selectFrom("salesbrainOutbox")
    .select("id")
    .where("alertedAt", ">", new Date(Date.now() - 6 * 3_600_000))
    .limit(1)
    .executeTakeFirst();
  if (ids.length) await db.updateTable("salesbrainOutbox").set({ alertedAt: new Date() }).where("id", "in", ids).execute();
  console.error("[salesbrain]", problem, ids.slice(0, 10));
  if (recent) return;
  await sendAppEmail({
    to: alertEmail(),
    fromName: "Home Service Ops",
    subject: "Sales Brain sync needs attention",
    html: `<p>Home Service Ops couldn't deliver ${ids.length} event${ids.length === 1 ? "" : "s"} to Sales Brain.</p><p><b>${problem.replace(/[<>&]/g, "")}</b></p><p>See /admin → Sales Brain for details. Fix the cause, then press <b>Resend held &amp; rejected</b>.</p>`,
    text: `Home Service Ops couldn't deliver ${ids.length} event(s) to Sales Brain.\n\n${problem}\n\nSee /admin → Sales Brain. Fix the cause, then press "Resend held & rejected".`,
  }).catch((e) => {
    if (!(e instanceof EmailNotConfiguredError)) console.error("[salesbrain] alert email failed", e instanceof Error ? e.message : e);
  });
}

/** Sends one batch and records the outcome on each row. */
async function sendBatch(rows: OutboxRow[]) {
  const ids = rows.map((r) => r.id);
  const body = batchBody(rows.map((r) => r.payload));
  const res = await post(body);
  const outcome = classifyResponse(res.status, res.json, ids, res.error);
  const now = new Date();
  switch (outcome.kind) {
    case "done": {
      if (outcome.sent.length) {
        await db.updateTable("salesbrainOutbox").set({ status: "sent", sentAt: now, lastError: null }).where("id", "in", outcome.sent).execute();
      }
      for (const r of outcome.rejected) {
        await db
          .updateTable("salesbrainOutbox")
          .set((eb) => ({ status: "rejected", lastError: r.error.slice(0, 500), attempts: eb("attempts", "+", 1) }))
          .where("id", "=", r.id)
          .execute();
      }
      if (outcome.rejected.length) await alert(outcome.rejected.map((r) => r.id), `Sales Brain rejected ${outcome.rejected.length} event(s): ${outcome.rejected[0].error}`);
      return { sent: outcome.sent.length, failed: outcome.rejected.length };
    }
    case "split":
      // One of these is bad; next run sends each on its own to find it.
      await db.updateTable("salesbrainOutbox").set({ sendAlone: true, nextAttemptAt: now, lastError: outcome.error.slice(0, 500) }).where("id", "in", ids).execute();
      return { sent: 0, failed: 0 };
    case "reject":
    case "hold":
      await db
        .updateTable("salesbrainOutbox")
        .set((eb) => ({ status: outcome.kind === "reject" ? "rejected" : "held", lastError: outcome.error.slice(0, 500), attempts: eb("attempts", "+", 1) }))
        .where("id", "in", ids)
        .execute();
      await alert(ids, outcome.kind === "hold" ? `Sales Brain refused the request (${outcome.error}). Check LSP_APP_SHARED_SECRET and the server clock.` : `Sales Brain rejected an event: ${outcome.error}`);
      return { sent: 0, failed: ids.length };
    case "retry": {
      const alertIds: string[] = [];
      // Rows in one batch can be on different attempts; group by the delay each now needs.
      const byAttempts = new Map<number, string[]>();
      for (const r of rows) {
        const failures = r.attempts + 1;
        if (failures === ALERT_AFTER) alertIds.push(r.id);
        byAttempts.set(failures, [...(byAttempts.get(failures) ?? []), r.id]);
      }
      for (const [failures, group] of byAttempts) {
        await db
          .updateTable("salesbrainOutbox")
          .set({ attempts: failures, nextAttemptAt: new Date(now.getTime() + retryDelayMs(failures)), lastError: outcome.error.slice(0, 500) })
          .where("id", "in", group)
          .execute();
      }
      if (alertIds.length) await alert(alertIds, `Sales Brain has been unreachable for over 2½ hours: ${outcome.error}`);
      return { sent: 0, failed: ids.length };
    }
  }
}

/** Sends everything that's due. Safe to run in parallel (rows are claimed). */
export async function processOutbox(opts: { maxBatches?: number } = {}) {
  if (!isSalesBrainConfigured()) return { skipped: "LSP_APP_SHARED_SECRET isn't set", sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  // Events split out of a refused batch go one per request.
  for (const row of await claim(25, true)) {
    const r = await sendBatch([row]);
    sent += r.sent;
    failed += r.failed;
  }
  for (let i = 0; i < (opts.maxBatches ?? 4); i++) {
    const rows = await claim(MAX_BATCH, false);
    if (!rows.length) break;
    const r = await sendBatch(rows);
    sent += r.sent;
    failed += r.failed;
    if (r.sent === 0) break; // don't hammer a struggling endpoint
  }
  return { sent, failed };
}

/** Signed GET: Sales Brain answers 200 {"ok":true} when the secret matches. */
export async function testConnection() {
  const key = secret();
  if (!key) return { ok: false, status: null as number | null, message: "LSP_APP_SHARED_SECRET isn't set in Supabase → Edge Functions → Secrets.", ms: 0 };
  const started = Date.now();
  try {
    const res = await fetch(SALES_BRAIN_URL, { method: "GET", headers: signedHeaders(key, ""), signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let ok = false;
    try {
      ok = res.status === 200 && (JSON.parse(text) as { ok?: unknown }).ok === true;
    } catch {
      ok = false;
    }
    return {
      ok,
      status: res.status as number | null,
      message: ok ? "Connected. Sales Brain accepted the signature." : `Sales Brain answered ${res.status}: ${text.slice(0, 200)}`,
      ms: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, status: null as number | null, message: `Couldn't reach Sales Brain: ${e instanceof Error ? e.message : String(e)}`, ms: Date.now() - started };
  }
}

// ---------- scheduled: drift + daily, admin tools, backfill ----------

/**
 * Every 15 minutes: queue accounts whose state changed without a hook (a trial running out, a
 * Stripe change seen on sync), and once a day per account the full state with fresh usage.
 */
export async function syncAllAccounts() {
  const date = brisbaneDate();
  const bizs = await db.selectFrom("businesses").select("id").orderBy("id").execute();
  if (!bizs.length) return { queued: 0 };
  const dailyId = (id: number) => `daily-account-${id}-${date}`;
  const have = new Set(
    (await db.selectFrom("salesbrainOutbox").select("id").where("id", "in", bizs.map((b) => dailyId(b.id))).execute()).map((r) => r.id),
  );
  let queued = 0;
  for (const b of bizs) {
    try {
      const did = await db.transaction().execute((trx) =>
        have.has(dailyId(b.id)) ? queueAccountSync(trx, b.id) : queueAccountSync(trx, b.id, { force: true, eventId: dailyId(b.id) }),
      );
      if (did) queued++;
    } catch (e) {
      console.error("[salesbrain] account sync failed", b.id, e instanceof Error ? e.message : e);
    }
  }
  return { queued };
}

export async function outboxSummary() {
  const counts = await db.selectFrom("salesbrainOutbox").select(["status", (eb) => eb.fn.countAll<string>().as("n")]).groupBy("status").execute();
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number>;
  const lastSent = await db.selectFrom("salesbrainOutbox").select("sentAt").where("status", "=", "sent").orderBy("sentAt", "desc").limit(1).executeTakeFirst();
  const oldestPending = await db.selectFrom("salesbrainOutbox").select("createdAt").where("status", "=", "pending").orderBy("createdAt").limit(1).executeTakeFirst();
  const problems = await db
    .selectFrom("salesbrainOutbox")
    .select(["id", "type", "status", "attempts", "lastError", "nextAttemptAt", "createdAt"])
    .where((eb) => eb.or([eb("status", "in", ["held", "rejected"]), eb.and([eb("status", "=", "pending"), eb("attempts", ">", 0)])]))
    .orderBy("createdAt", "desc")
    .limit(25)
    .execute();
  return {
    configured: isSalesBrainConfigured(),
    pending: by.pending ?? 0,
    sent: by.sent ?? 0,
    rejected: by.rejected ?? 0,
    held: by.held ?? 0,
    lastSentAt: lastSent?.sentAt ?? null,
    oldestPendingAt: oldestPending?.createdAt ?? null,
    problems,
  };
}

/** After fixing the cause: put held and rejected events back in the queue. */
export async function resendProblems() {
  const r = await db
    .updateTable("salesbrainOutbox")
    .set({ status: "pending", nextAttemptAt: new Date(), attempts: 0, alertedAt: null })
    .where("status", "in", ["held", "rejected"])
    .executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0);
}

type StripeInvoiceFull = StripeInvoiceLite & { status?: string | null; attempt_count?: number; customer?: string };
type StripeRefundFull = StripeRefundLite & { charge?: { id: string; customer?: string | null } | string | null; status?: string };

/**
 * One-off (re-runnable): every account, the last 90 days of payments and every open or pending
 * ticket. Ids are deterministic, so running it again the same day queues nothing new.
 */
export async function runBackfill() {
  const date = brisbaneDate();
  const errors: string[] = [];
  let accounts = 0;
  let payments = 0;
  let tickets = 0;

  const bizs = await db.selectFrom("businesses").select(["id", "stripeCustomerId"]).orderBy("id").execute();
  for (const b of bizs) {
    try {
      await db.transaction().execute((trx) => queueAccountSync(trx, b.id, { force: true, eventId: `backfill-account-${b.id}-${date}` }));
      accounts++;
    } catch (e) {
      errors.push(`account ${b.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (isStripeConfigured()) {
    const since = Math.floor((Date.now() - 90 * 86_400_000) / 1000);
    const byCustomer = new Map(bizs.filter((b) => b.stripeCustomerId).map((b) => [b.stripeCustomerId!, b.id]));
    for (const [customer, businessId] of byCustomer) {
      try {
        const inv = await stripeApi<{ data: StripeInvoiceFull[] }>("/invoices", { params: { customer, limit: 100, created: { gte: since } } });
        const events = inv.data.flatMap((i) => {
          if (i.status === "paid" && (i.amount_paid ?? 0) > 0) return [{ id: `backfill-payment-${i.id}-paid`, type: "payment.recorded" as const, data: paymentFromInvoice(businessId, i, "paid") }];
          if ((i.status === "open" || i.status === "uncollectible") && (i.attempt_count ?? 0) > 0) {
            return [{ id: `backfill-payment-${i.id}-failed`, type: "payment.recorded" as const, data: paymentFromInvoice(businessId, i, "failed") }];
          }
          return [];
        });
        await enqueue(db, events);
        payments += events.length;
      } catch (e) {
        errors.push(`invoices for ${businessId}: ${e instanceof Error ? e.message : e}`);
      }
    }
    try {
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        const r = await stripeApi<{ data: StripeRefundFull[]; has_more: boolean }>("/refunds", {
          params: { limit: 100, created: { gte: since }, "expand[]": "data.charge", ...(after ? { starting_after: after } : {}) },
        });
        const events = r.data.flatMap((ref) => {
          const customer = ref.charge && typeof ref.charge === "object" ? ref.charge.customer : null;
          const businessId = customer ? byCustomer.get(customer) : undefined;
          if (!businessId || ref.status === "failed" || ref.status === "canceled") return [];
          const chargeId = typeof ref.charge === "object" && ref.charge ? ref.charge.id : ref.charge ?? null;
          return [{ id: `refund-${ref.id}`, type: "payment.recorded" as const, data: paymentFromRefund(businessId, { ...ref, charge: chargeId }) }];
        });
        await enqueue(db, events);
        payments += events.length;
        if (!r.has_more || !r.data.length) break;
        after = r.data[r.data.length - 1].id;
      }
    } catch (e) {
      errors.push(`refunds: ${e instanceof Error ? e.message : e}`);
    }
  }

  const open = await db.selectFrom("supportTickets").selectAll().where("status", "in", ["open", "pending"]).execute();
  await enqueue(
    db,
    open.map((t) => ({ id: `backfill-ticket-${t.id}-${date}`, type: "ticket.upserted" as const, occurredAt: t.updatedAt, data: ticketData(t) })),
  );
  tickets = open.length;

  return { accounts, payments, tickets, errors };
}
