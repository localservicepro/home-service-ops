import { describe, it, expect } from "vitest";
import {
  ALERT_AFTER,
  BACKOFF_MS,
  accountData,
  accountFingerprint,
  batchBody,
  classifyResponse,
  compActive,
  paymentFromInvoice,
  isValidUuid,
  paymentFromLedger,
  paymentFromRefund,
  retryDelayMs,
  signPayload,
  signedHeaders,
  ticketData,
  type AccountSource,
} from "./salesBrainEvents";

// Expected values computed independently with Python's hmac module.
describe("signature", () => {
  const body = batchBody([{ id: "evt_1", type: "account.upserted", occurred_at: "2026-11-01T00:00:00.000Z", data: { account_id: "7", status: "active" } }]);

  it("is hex HMAC-SHA256 of '<timestamp>.<raw body>'", () => {
    expect(body).toBe('{"events":[{"id":"evt_1","type":"account.upserted","occurred_at":"2026-11-01T00:00:00.000Z","data":{"account_id":"7","status":"active"}}]}');
    expect(signPayload("test-secret-123", "1761955200", body)).toBe("71b435d600bc35a3dddcd7efe31306a749d18b8e57c0b36afcd2fdc8c33d69b4");
  });

  it("signs '<timestamp>.' for the empty-body connection check", () => {
    expect(signPayload("test-secret-123", 1761955200, "")).toBe("942bc8634df8fbea1dd6be58176db068667fd73dd511998a61fcc6a1a6fd3e4f");
  });

  it("puts unix seconds and sha256=<hex> in the headers", () => {
    const h = signedHeaders("test-secret-123", body, 1761955200_999);
    expect(h["x-lsp-timestamp"]).toBe("1761955200");
    expect(h["x-lsp-signature"]).toBe("sha256=71b435d600bc35a3dddcd7efe31306a749d18b8e57c0b36afcd2fdc8c33d69b4");
    expect(h["Content-Type"]).toBe("application/json");
  });
});

const NOW = new Date("2026-11-01T00:00:00Z");
const base: AccountSource = {
  id: 42,
  name: "Bob's Plumbing",
  createdAt: new Date("2026-10-01T02:00:00Z"),
  plan: "trial",
  comp: false,
  trialEndsAt: new Date("2026-11-10T02:00:00Z"),
  subscriptionStatus: null,
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  cancelReason: null,
  lastActiveAt: new Date("2026-10-31T22:15:00Z"),
  lastInvoiceCents: null,
  ownerName: "Bob Smith",
  email: "bob@bobsplumbing.com.au",
  phone: "0400 000 000",
  jobsLast30d: 18,
  users: 2,
};

describe("account.upserted", () => {
  it("sends the full current state with every field", () => {
    expect(accountData(base, NOW)).toEqual({
      account_id: "42",
      sales_brain_customer_id: null,
      business_name: "Bob's Plumbing",
      owner_name: "Bob Smith",
      email: "bob@bobsplumbing.com.au",
      phone: "+61400000000",
      plan: "Team trial",
      status: "trial",
      mrr_cents: 0,
      currency: "aud",
      signed_up_at: "2026-10-01T02:00:00.000Z",
      cancelled_at: null,
      cancel_reason: null,
      last_active_at: "2026-10-31T22:15:00.000Z",
      usage: { jobs_last_30d: 18, users: 2 },
    });
  });

  it("active: plan name and monthly price in cents with GST", () => {
    const d = accountData({ ...base, plan: "solo", subscriptionStatus: "active", trialEndsAt: null }, NOW);
    expect(d).toMatchObject({ status: "active", plan: "Solo", mrr_cents: 5390 });
    // The last regular charge wins (discounts, actual tax).
    expect(accountData({ ...base, plan: "team", subscriptionStatus: "active", lastInvoiceCents: 12900 }, NOW)).toMatchObject({ plan: "Team", mrr_cents: 12900 });
  });

  it("past_due and unpaid → past_due, still owing the plan price", () => {
    expect(accountData({ ...base, plan: "team", subscriptionStatus: "past_due" }, NOW)).toMatchObject({ status: "past_due", mrr_cents: 14190 });
    expect(accountData({ ...base, plan: "team", subscriptionStatus: "unpaid" }, NOW)).toMatchObject({ status: "past_due" });
  });

  it("paused and Stripe trialing", () => {
    expect(accountData({ ...base, plan: "solo", subscriptionStatus: "paused" }, NOW)).toMatchObject({ status: "paused", plan: "Solo", mrr_cents: 0 });
    expect(accountData({ ...base, plan: "team", subscriptionStatus: "trialing" }, NOW)).toMatchObject({ status: "trial", plan: "Team", mrr_cents: 0 });
  });

  it("cancelled subscription keeps the reason they gave", () => {
    const d = accountData(
      { ...base, plan: "solo", subscriptionStatus: "canceled", trialEndsAt: null, cancelledAt: new Date("2026-10-20T00:00:00Z"), cancelReason: "  Too expensive for us right now " },
      NOW,
    );
    expect(d).toMatchObject({ status: "cancelled", plan: "Solo", mrr_cents: 0, cancelled_at: "2026-10-20T00:00:00.000Z", cancel_reason: "Too expensive for us right now" });
  });

  it("an ended trial with no plan counts as cancelled, dated when the trial ended", () => {
    const d = accountData({ ...base, trialEndsAt: new Date("2026-10-15T02:00:00Z") }, NOW);
    expect(d).toMatchObject({ status: "cancelled", plan: "Trial", cancelled_at: "2026-10-15T02:00:00.000Z", cancel_reason: "Trial ended without choosing a plan" });
  });

  it("a reason given while cancelling at period end goes with the still-active account", () => {
    expect(accountData({ ...base, plan: "team", subscriptionStatus: "active", cancelAtPeriodEnd: true, cancelReason: "Moving to another app" }, NOW)).toMatchObject({
      status: "active",
      cancelled_at: null,
      cancel_reason: "Moving to another app",
    });
  });

  it("complimentary accounts are active at $0", () => {
    expect(accountData({ ...base, comp: true }, NOW)).toMatchObject({ status: "active", plan: "Team (complimentary)", mrr_cents: 0 });
  });

  const SB = "3f6c2a1e-8b4d-4c2a-9f1e-2d7b6a5c4e3f";
  const included = { ...base, comp: true, compSource: "salesbrain", salesBrainCustomerId: SB, trialEndsAt: null };

  it("Sales Brain's included plan: active, its plan name, $0, with sales_brain_customer_id", () => {
    const d = accountData({ ...included, cancelReason: "old reason" }, NOW);
    expect(d).toMatchObject({ account_id: "42", sales_brain_customer_id: SB, status: "active", plan: "Included with Sales Brain", mrr_cents: 0, cancel_reason: null });
    // Accounts not from Sales Brain don't carry the field.
    expect(accountData(base, NOW)).toHaveProperty("sales_brain_customer_id", null);
  });

  it("still included until ends_at, then like an account without a subscription", () => {
    const later = accountData({ ...included, compEndsAt: new Date("2026-12-01T00:00:00Z") }, NOW);
    expect(later).toMatchObject({ status: "active", plan: "Included with Sales Brain" });
    const after = accountData({ ...included, compEndsAt: new Date("2026-10-31T00:00:00Z") }, NOW);
    expect(after).toMatchObject({
      sales_brain_customer_id: SB,
      status: "cancelled",
      plan: "Included with Sales Brain",
      mrr_cents: 0,
      cancelled_at: "2026-10-31T00:00:00.000Z",
      cancel_reason: "Sales Brain plan no longer includes the app",
    });
    // Once the tick has switched it off, the same.
    expect(accountData({ ...included, comp: false, compSource: null, compEndsAt: new Date("2026-10-31T00:00:00Z") }, NOW)).toMatchObject({ status: "cancelled" });
    // And if they then subscribe, they're simply active on that plan.
    expect(
      accountData({ ...included, comp: false, compSource: null, compEndsAt: new Date("2026-10-31T00:00:00Z"), plan: "solo", subscriptionStatus: "active" }, NOW),
    ).toMatchObject({ status: "active", plan: "Solo", sales_brain_customer_id: SB });
  });

  it("compActive honours a scheduled end", () => {
    expect(compActive({ comp: true }, NOW)).toBe(true);
    expect(compActive({ comp: true, compEndsAt: new Date("2026-11-01T00:00:01Z") }, NOW)).toBe(true);
    expect(compActive({ comp: true, compEndsAt: NOW }, NOW)).toBe(false);
    expect(compActive({ comp: false }, NOW)).toBe(false);
  });

  it("fingerprint ignores usage and activity but not status, plan or price", () => {
    const a = accountData(base, NOW);
    expect(accountFingerprint({ ...a, usage: { jobs_last_30d: 99, users: 9 }, last_active_at: "x" })).toBe(accountFingerprint(a));
    expect(accountFingerprint({ ...a, status: "active" })).not.toBe(accountFingerprint(a));
    expect(accountFingerprint({ ...a, mrr_cents: 1 })).not.toBe(accountFingerprint(a));
  });
});

describe("payment.recorded", () => {
  const inv = {
    id: "in_456",
    amount_paid: 14190,
    amount_due: 14190,
    currency: "aud",
    billing_reason: "subscription_cycle",
    created: 1793491200,
    status_transitions: { paid_at: 1793491260 },
    lines: { data: [{ description: "1 × Home Service Ops — Team", period: { start: 1793491200 }, price: { lookup_key: "hso_team_monthly_aud" } }] },
  };

  it("paid subscription invoice", () => {
    expect(paymentFromInvoice(42, inv, "paid")).toEqual({
      account_id: "42",
      payment_id: "in_456",
      amount_cents: 14190,
      currency: "aud",
      status: "paid",
      kind: "subscription",
      description: "Team plan, November",
      paid_at: "2026-11-01T00:01:00.000Z",
    });
  });

  it("failed charge uses the amount due and the event time", () => {
    const d = paymentFromInvoice(42, { ...inv, amount_paid: 0, status_transitions: null }, "failed", 1793494800);
    expect(d).toMatchObject({ payment_id: "in_456", status: "failed", amount_cents: 14190, paid_at: "2026-11-01T01:00:00.000Z" });
  });

  it("manual invoices are one_off; unknown lines keep their description", () => {
    const d = paymentFromInvoice(42, { ...inv, billing_reason: "manual", lines: { data: [{ description: "Setup help", period: { start: 1793491200 } }] } }, "paid");
    expect(d).toMatchObject({ kind: "one_off", description: "Setup help" });
  });

  it("refunds are positive amounts with status refunded", () => {
    expect(paymentFromRefund(42, { id: "re_9", amount: 5390, currency: "AUD", created: 1793491200, charge: "ch_1" })).toEqual({
      account_id: "42",
      payment_id: "re_9",
      amount_cents: 5390,
      currency: "aud",
      status: "refunded",
      kind: "refund",
      description: "Refund of ch_1",
      paid_at: "2026-11-01T00:00:00.000Z",
    });
  });
});

describe("ticket.upserted", () => {
  it("maps a ticket", () => {
    expect(
      ticketData({
        id: 789,
        businessId: 42,
        subject: "Can't send a quote",
        body: "When I press send nothing happens",
        status: "open",
        priority: "high",
        category: "quotes",
        lastMessage: "Still not working this morning",
        openedAt: new Date("2026-11-01T21:00:00Z"),
        updatedAt: new Date("2026-11-01T23:30:00Z"),
        solvedAt: null,
      }),
    ).toEqual({
      account_id: "42",
      ticket_id: "789",
      subject: "Can't send a quote",
      body: "When I press send nothing happens",
      status: "open",
      priority: "high",
      category: "quotes",
      last_message: "Still not working this morning",
      opened_at: "2026-11-01T21:00:00.000Z",
      updated_at: "2026-11-01T23:30:00.000Z",
      solved_at: null,
    });
  });
});

describe("ticket.upserted status", () => {
  it("sends this app's in-progress stage as open (Sales Brain has no in progress)", () => {
    const base = { id: 1, businessId: 2, subject: "s", body: "b", priority: "normal", category: "app", lastMessage: null, openedAt: NOW, updatedAt: NOW, solvedAt: null };
    expect(ticketData({ ...base, status: "in_progress" }).status).toBe("open");
    expect(ticketData({ ...base, status: "pending" }).status).toBe("pending");
  });
});

describe("responses and retries", () => {
  const ids = ["a", "b", "c"];

  it("200 → all sent", () => {
    expect(classifyResponse(200, { ok: true, processed: 3, duplicates: 0, errors: [] }, ids)).toEqual({ kind: "done", sent: ids, rejected: [] });
  });

  it("207 → only the named events are rejected", () => {
    expect(classifyResponse(207, { ok: false, errors: [{ id: "b", error: "status must be one of …" }, { id: "zzz", error: "not ours" }] }, ids)).toEqual({
      kind: "done",
      sent: ["a", "c"],
      rejected: [{ id: "b", error: "status must be one of …" }],
    });
  });

  it("400 splits a batch, rejects a single event", () => {
    expect(classifyResponse(400, { error: "bad body" }, ids)).toEqual({ kind: "split", error: "400 bad body" });
    expect(classifyResponse(400, { error: "bad body" }, ["a"])).toEqual({ kind: "reject", error: "400 bad body" });
  });

  it("401 holds until someone fixes the secret or clock", () => {
    expect(classifyResponse(401, { error: "stale timestamp" }, ids)).toEqual({ kind: "hold", error: "401 stale timestamp" });
  });

  it("503, other 5xx, 429 and network errors back off", () => {
    expect(classifyResponse(503, { error: "no secret yet" }, ids).kind).toBe("retry");
    expect(classifyResponse(502, "Bad gateway", ids)).toEqual({ kind: "retry", error: "502 Bad gateway" });
    expect(classifyResponse(429, null, ids).kind).toBe("retry");
    expect(classifyResponse(null, null, ids, "ECONNRESET")).toEqual({ kind: "retry", error: "ECONNRESET" });
  });

  it("backs off 1m, 5m, 30m, 2h, then alerts and keeps trying every 2h", () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 7_200_000, 7_200_000]);
    expect(BACKOFF_MS).toHaveLength(4);
    expect(ALERT_AFTER).toBe(5);
  });
});

describe("payment.recorded from the ledger", () => {
  it("paid, failed and refunded rows keep their status, amount in cents and time", () => {
    const at = new Date("2026-10-15T03:00:00.000Z");
    for (const [status, kind] of [["paid", "subscription"], ["failed", "subscription"], ["refunded", "refund"]]) {
      expect(paymentFromLedger({ id: "in_1", businessId: 42, amountCents: 5390, status, kind, description: "Team plan, October", paidAt: at })).toEqual({
        account_id: "42", payment_id: "in_1", amount_cents: 5390, currency: "aud", status, kind, description: "Team plan, October", paid_at: "2026-10-15T03:00:00.000Z",
      });
    }
  });
});

describe("sales_brain_customer_id", () => {
  it("is sent only when it's a UUID Sales Brain accepts, otherwise null", () => {
    expect(isValidUuid("c049e71c-392c-4a08-a505-8970e97520bb")).toBe(true);
    expect(isValidUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isValidUuid("00000000-0000-0000-0000-000000000006")).toBe(false); // version 0
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(accountData({ ...base, salesBrainCustomerId: "00000000-0000-0000-0000-000000000006" }, NOW)).toHaveProperty("sales_brain_customer_id", null);
    expect(accountData({ ...base, salesBrainCustomerId: "c049e71c-392c-4a08-a505-8970e97520bb" }, NOW)).toHaveProperty("sales_brain_customer_id", "c049e71c-392c-4a08-a505-8970e97520bb");
  });
});

describe("usage", () => {
  it("carries the account's numbers, flat; users and jobs_last_30d always present", () => {
    const d = accountData({ ...base, usage: { logins_last_30d: 9, quotes_won_last_30d: 3, invoiced_last_30d_cents: 108900, last_job_at: "2026-10-18T23:20:06.894Z", users: 99 } }, NOW);
    expect(d.usage).toEqual({ logins_last_30d: 9, quotes_won_last_30d: 3, invoiced_last_30d_cents: 108900, last_job_at: "2026-10-18T23:20:06.894Z", jobs_last_30d: 18, users: 2 });
    for (const v of Object.values(d.usage as Record<string, unknown>)) expect(["number", "string"].includes(typeof v) || v === null).toBe(true);
  });

  it("isn't part of the change fingerprint (it goes out daily, not on every job)", () => {
    expect(accountFingerprint(accountData({ ...base, usage: { jobs_total: 1 } }, NOW))).toBe(accountFingerprint(accountData({ ...base, usage: { jobs_total: 2 } }, NOW)));
  });
});
