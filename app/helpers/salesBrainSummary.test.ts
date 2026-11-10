import { describe, it, expect, vi, beforeEach } from "vitest";
import { signPayload } from "./salesBrainEvents";
import { computeOverview, computeSupport, DAY, type MetricsData } from "./adminMetrics";
import { buildSummary, parseSummaryQuery } from "./salesBrainSummary";
import type { AdminCustomer, AdminPayment } from "./adminShared";
import type { TicketSummary } from "./supportShared";

const SECRET = "test-secret-123";
let fixture: MetricsData;
vi.mock("./serverEnv", () => ({ env: (k: string) => (k === "LSP_APP_SHARED_SECRET" ? SECRET : undefined) }));
vi.mock("./adminData", () => ({ loadMetrics: vi.fn(async () => fixture) }));

const NOW = Date.UTC(2026, 10, 20, 2, 0, 0); // 20 Nov 2026, noon in Brisbane
const ago = (days: number, hours = 0) => new Date(NOW - days * DAY - hours * 3_600_000);

function customer(id: number, over: Partial<AdminCustomer>): AdminCustomer {
  return {
    id, name: `Biz ${id}`, ownerName: "", email: "", phone: "", status: "active", access: "paying", plan: "Team", trade: "lawn",
    mrrCents: 0, signedUpAt: ago(200), lastActiveAt: ago(1), trialEndsAt: null, cancelledAt: null, jobs30d: 0, users: 1,
    openTickets: 0, salesBrain: false, cancelReason: null, demo: false, ...over,
  };
}
const pay = (id: string, businessId: number, amountCents: number, status: string, at: Date): AdminPayment => ({
  id, businessId, businessName: `Biz ${businessId}`, amountCents, status, kind: status === "refunded" ? "refund" : "subscription", description: "", paidAt: at,
});
const ticket = (id: number, businessId: number, status: string, priority: string, category: string, openedAt: Date, extra: { solvedAt?: Date; firstResponseAt?: Date; assignedTo?: number } = {}) => ({
  id, businessId, status, priority, category, assignedTo: extra.assignedTo ?? null, openedAt, solvedAt: extra.solvedAt ?? null, firstResponseAt: extra.firstResponseAt ?? null,
});
const summary = (id: number, businessId: number, status: string, priority: string, updatedAt: Date, assignedTo: number | null = null): TicketSummary => ({
  id, subject: `Ticket ${id}`, status, priority, category: "quotes", lastMessage: null, openedAt: updatedAt, updatedAt, solvedAt: null, businessId, businessName: `Biz ${businessId}`, assignedTo,
});

function makeFixture(): MetricsData {
  return {
    customers: [
      customer(1, { access: "paying", plan: "Team", mrrCents: 9900, signedUpAt: ago(10) }),
      customer(2, { access: "past_due", status: "past_due", plan: "Solo", mrrCents: 4400 }),
      customer(3, { access: "trial", status: "trial", plan: "Team trial", signedUpAt: ago(40) }),
      customer(4, { access: "included", plan: "Included with Sales Brain", salesBrain: true }),
      customer(5, { access: "none", status: "cancelled", cancelledAt: ago(5), cancelReason: "Too expensive" }),
      // Demo: must vanish unless asked for.
      customer(90, { access: "paying", plan: "Team", mrrCents: 9900, demo: true, signedUpAt: ago(3) }),
    ],
    payments: [
      pay("p1", 1, 9900, "paid", ago(2)),
      pay("p2", 2, 4400, "failed", ago(3)),
      pay("r1", 1, 1000, "refunded", ago(4)),
      pay("p3", 1, 9900, "paid", ago(35)),
      pay("d1", 90, 9900, "paid", ago(1)),
    ],
    lifetime: [{ businessId: 1, cents: 18800 }, { businessId: 90, cents: 9900 }],
    jobsPrev: [{ businessId: 1, n: 4 }, { businessId: 90, n: 50 }],
    tickets: [
      ticket(1, 1, "open", "urgent", "billing", ago(0, 30), { firstResponseAt: ago(0, 28) }),
      ticket(2, 2, "pending", "normal", "quotes", ago(3), { assignedTo: 7, firstResponseAt: ago(3, -4) }),
      ticket(3, 3, "solved", "low", "quotes", ago(6), { solvedAt: ago(5), assignedTo: 7 }),
      ticket(4, 90, "open", "high", "app", ago(1)),
    ],
    activeTickets: [summary(1, 1, "open", "urgent", ago(1)), summary(4, 90, "open", "high", ago(2)), summary(2, 2, "pending", "normal", ago(0, 5), 7)],
    staff: [{ id: 7, displayName: "Ryan" }],
  };
}

beforeEach(() => {
  fixture = makeFixture();
});

async function call(query = "", headers?: Record<string, string>) {
  const { handle } = await import("../endpoints/integrations/sales-brain/summary_GET");
  const ts = String(Math.floor(Date.now() / 1000));
  const h = headers ?? { "x-lsp-timestamp": ts, "x-lsp-signature": `sha256=${signPayload(SECRET, ts, "")}` };
  const res = await handle(new Request(`https://x/functions/v1/api/integrations/sales-brain/summary${query}`, { headers: h }));
  return { status: res.status, body: await res.json() };
}

describe("signature", () => {
  it("good: HMAC of '<timestamp>.' with the shared secret", async () => {
    const r = await call("?days=30");
    expect(r.status).toBe(200);
    expect(r.body.days).toBe(30);
  });

  it("bad: wrong secret, wrong string, missing headers", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect((await call("", { "x-lsp-timestamp": ts, "x-lsp-signature": `sha256=${signPayload("nope", ts, "")}` })).status).toBe(401);
    expect((await call("", { "x-lsp-timestamp": ts, "x-lsp-signature": `sha256=${signPayload(SECRET, ts, "{}")}` })).status).toBe(401);
    expect((await call("", { "x-lsp-timestamp": ts })).status).toBe(401);
    expect((await call("", {})).status).toBe(401);
  });

  it("stale: a timestamp more than 5 minutes off", async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 301);
    const r = await call("", { "x-lsp-timestamp": ts, "x-lsp-signature": `sha256=${signPayload(SECRET, ts, "")}` });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/5 minutes/);
  });
});

describe("query", () => {
  it("days defaults to 30, must be 1 to 365; include_demo=1 turns demo on", () => {
    expect(parseSummaryQuery(new URL("https://x/s"))).toEqual({ days: 30, includeDemo: false });
    expect(parseSummaryQuery(new URL("https://x/s?days=7&include_demo=1"))).toEqual({ days: 7, includeDemo: true });
    expect("error" in parseSummaryQuery(new URL("https://x/s?days=0"))).toBe(true);
    expect("error" in parseSummaryQuery(new URL("https://x/s?days=abc"))).toBe(true);
    expect("error" in parseSummaryQuery(new URL("https://x/s?days=366"))).toBe(true);
  });

  it("a bad days is a 400", async () => {
    expect((await call("?days=-1")).status).toBe(400);
  });
});

describe("numbers", () => {
  it("equal the Dashboard and Support overview for the same data", () => {
    const data = makeFixture();
    const dash = computeOverview(data, { now: NOW });
    const sup = computeSupport(data, { now: NOW });
    const s = buildSummary(data, { days: 30, includeDemo: true, now: NOW });

    expect(s.revenue.mrr_cents).toBe(dash.kpis.mrrCents);
    expect(s.revenue.paying).toBe(dash.kpis.paying);
    expect(s.revenue.average_cents).toBe(dash.kpis.arpaCents);
    expect(s.revenue.period_cents).toBe(dash.kpis.revenue30Cents);
    expect(s.revenue.previous_period_cents).toBe(dash.kpis.revenuePrev30Cents);
    expect(s.revenue.refunds_cents).toBe(dash.paymentHealth.refundedCents30);
    expect(s.revenue.failed_payments).toBe(dash.paymentHealth.failed30);
    expect(s.customers.with_access).toBe(dash.kpis.withAccess);
    expect(s.customers.new_in_period).toBe(dash.kpis.signups30);
    expect(s.customers.lost_in_period).toBe(dash.kpis.churned30);
    expect(s.customers.by_plan.map((p) => [p.plan, p.accounts, p.mrr_cents])).toEqual(dash.plans.map((p) => [p.name, p.count, p.mrrCents]));
    expect(s.support.open).toBe(sup.open);
    expect(s.support.waiting_on_customer).toBe(sup.pending);
    expect(s.support.urgent_or_high).toBe(sup.urgent);
    expect(s.support.solved_in_period).toBe(sup.solved30);
    expect(s.support.avg_first_reply_hours).toBe(sup.avgFirstReplyHours);
    // The Dashboard's support card and the Support overview agree too.
    expect([dash.support.open, dash.support.pending, dash.support.urgent, dash.support.unassigned]).toEqual([sup.open, sup.pending, sup.urgent, sup.unassigned]);
  });

  it("are right in absolute terms (demo included)", () => {
    const s = buildSummary(makeFixture(), { days: 30, includeDemo: true, now: NOW });
    expect(s.demo_included).toBe(true);
    expect(s.revenue).toEqual({
      mrr_cents: 9900 + 4400 + 9900,
      paying: 3, // paying + overdue
      average_cents: Math.round(24200 / 3),
      period_cents: 9900 - 1000 + 9900, // failed payments aren't revenue
      previous_period_cents: 9900,
      last_12_months_cents: 9900 * 3 - 1000,
      refunds_cents: 1000,
      failed_payments: 1,
    });
    expect(s.customers).toMatchObject({ total: 6, with_access: 5, paying: 2, trial: 1, included_with_sales_brain: 1, free: 0, past_due: 1, new_in_period: 2, new_previous_period: 1, lost_in_period: 1 });
    // 1 lost of the 4 who had access at the start of the period (3 signed up before it, plus the 1 lost).
    expect(s.customers.churn_pct).toBe(25);
    expect(s.support).toMatchObject({
      open: 2, waiting_on_customer: 1, urgent_or_high: 2, unassigned: 2, new_this_week: 4, solved_this_week: 1, solved_in_period: 1,
      avg_first_reply_hours: 3, avg_time_to_solve_hours: 24,
      by_priority: { urgent: 1, high: 1, normal: 1, low: 0 },
      workload: [{ staff: "Ryan", open: 1, solved_in_period: 1 }],
    });
    expect(s.support.topics).toEqual(expect.arrayContaining([{ topic: "Quotes", count: 2 }, { topic: "My plan & billing", count: 1 }, { topic: "The app / something's broken", count: 1 }]));
    expect(s.support.waiting_longest.map((t) => t.subject)).toEqual(["Ticket 4", "Ticket 1"]);
    expect(s.support.waiting_longest[0]).toMatchObject({ business: "Biz 90", priority: "high", status: "open", waiting_hours: 48 });
  });

  it("days changes the period", () => {
    const s = buildSummary(makeFixture(), { days: 3, includeDemo: false, now: NOW });
    expect(s.days).toBe(3);
    expect(s.revenue.period_cents).toBe(9900); // only p1 (2 days ago); the refund was 4 days ago
    expect(s.revenue.previous_period_cents).toBe(-1000);
    expect(s.revenue.failed_payments).toBe(0);
  });

  it("leaves out averages we don't have", () => {
    const data = makeFixture();
    data.tickets = data.tickets.map((t) => ({ ...t, firstResponseAt: null, solvedAt: null, status: t.status === "solved" ? "open" : t.status }));
    const s = buildSummary(data, { days: 30, includeDemo: false, now: NOW });
    expect("avg_first_reply_hours" in s.support).toBe(false);
    expect("avg_time_to_solve_hours" in s.support).toBe(false);
  });
});

describe("demo customers", () => {
  it("are left out by default, with everything that belongs to them", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.demo_included).toBe(false);
    expect(r.body.customers.total).toBe(5);
    expect(r.body.revenue.mrr_cents).toBe(9900 + 4400);
    expect(r.body.support.urgent_or_high).toBe(1);
    expect(r.body.support.waiting_longest.map((t: { business: string }) => t.business)).not.toContain("Biz 90");
  });

  it("are counted with include_demo=1", async () => {
    const r = await call("?include_demo=1");
    expect(r.body.demo_included).toBe(true);
    expect(r.body.customers.total).toBe(6);
    expect(r.body.revenue.mrr_cents).toBe(9900 + 4400 + 9900);
  });
});
