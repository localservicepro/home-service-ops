import { describe, it, expect, vi, beforeEach } from "vitest";
import { signPayload } from "./salesBrainEvents";
import { computeDashboard } from "./dashboardStats";
import { analytics, brisbaneToday, brisbaneWall, businessStats, ticket, type OpsRows } from "./salesBrainCustomers";
import type { AdminCustomer, AdminCustomerDetail } from "./adminShared";
import type { TicketSummary } from "./supportShared";
import type { Job, Quote, StaffMember } from "../endpoints/ops/snapshot_GET.schema";

const SECRET = "test-secret-123";
vi.mock("./serverEnv", () => ({ env: (k: string) => (k === "LSP_APP_SHARED_SECRET" ? SECRET : undefined) }));

const state: { customers: AdminCustomer[]; rows: OpsRows; tickets: TicketSummary[]; demoIds: number[] } = { customers: [], rows: { jobs: [], quotes: [], staff: [] }, tickets: [], demoIds: [] };
vi.mock("./adminData", () => ({
  listCustomers: vi.fn(async () => state.customers),
  loadOpsRows: vi.fn(async (ids: number[]) => ({
    jobs: state.rows.jobs.filter((j) => ids.includes(j.businessId)),
    quotes: state.rows.quotes.filter((q) => ids.includes(q.businessId)),
    staff: state.rows.staff.filter((s) => ids.includes(s.businessId)),
  })),
  customerDetail: vi.fn(async (id: number) => {
    const c = state.customers.find((x) => x.id === id);
    if (!c) throw new Error("Customer not found");
    return {
      ...c, onboardedAt: null, suspendedAt: null, suspendedReason: null,
      details: { abn: "", phone: "", email: "", address: "", website: "", area: "" },
      billing: { subscribedPlan: "team", subscriptionStatus: "active", stripeCustomerId: "cus_x", stripeSubscriptionId: "sub_x", currentPeriodEnd: null, cancelAtPeriodEnd: false, comp: false, compSource: null, compNote: null, compEndsAt: null, salesBrainCustomerId: null, salesBrainPlan: null, lastInvoiceCents: 9900, lifetimeCents: 19800 },
      payments: [], members: [{ id: 1, name: "Bob", email: "bob@x.au", role: "owner", joinedAt: null }], invites: [],
      usage: { clients: 3, quotes: 2, jobs: 4, jobs30d: 2, lastJobAt: null },
      tickets: state.tickets.filter((t) => t.businessId === id), notes: [], supportSessions: [],
    } satisfies AdminCustomerDetail;
  }),
}));
vi.mock("./support", () => ({
  listTickets: vi.fn(async (o: { status?: string[]; businessId?: number }) =>
    state.tickets.filter((t) => (!o.status?.length || o.status.includes(t.status)) && (!o.businessId || t.businessId === o.businessId)),
  ),
  getTicket: vi.fn(async (id: number) => {
    const t = state.tickets.find((x) => x.id === id);
    if (!t) throw new Error("Ticket not found");
    return { ...t, body: "Help", createdByEmail: "bob@x.au", messages: [{ id: 1, body: "Looking now", fromStaff: true, internal: true, authorName: "Ryan (internal note)", createdAt: t.updatedAt }] };
  }),
}));
vi.mock("./db", () => {
  const chain = { select: () => chain, where: () => chain, execute: async () => state.demoIds.map((id) => ({ id })) };
  return { db: { selectFrom: () => chain } };
});

const NOW = Date.UTC(2026, 11, 10, 2, 0, 0); // 10 Dec 2026, noon in Brisbane
const at = (s: string) => new Date(s);

function cust(id: number, over: Partial<AdminCustomer> = {}): AdminCustomer {
  return {
    id, name: `Biz ${id}`, ownerName: "Bob", email: "bob@x.au", phone: "", status: "active", access: "paying", plan: "Team", trade: "lawn",
    mrrCents: 9900, signedUpAt: at("2026-01-01T00:00:00Z"), lastActiveAt: null, trialEndsAt: null, cancelledAt: null, jobs30d: 0, users: 1,
    openTickets: 0, salesBrain: false, cancelReason: null, demo: false, ...over,
  };
}
type JobRow = OpsRows["jobs"][number];
const job = (businessId: number, status: JobRow["status"], price: number, scheduledDate: string, statusChangedAt: string, extra: Partial<JobRow> = {}): JobRow => ({
  businessId, status, price, scheduledDate, statusChangedAt: at(statusChangedAt), createdAt: at(statusChangedAt), payMethod: status === "Paid" ? "cash" : null, payProvider: null, service: "Mowing", staffId: 5, source: "manual", ...extra,
});

function rows(): OpsRows {
  return {
    jobs: [
      // Paid on 1 Dec at 1am Brisbane, which is still 30 Nov in UTC: December in their dashboard.
      job(1, "Paid", 120, "2026-11-30", "2026-11-30T15:00:00Z"),
      job(1, "Paid", 80.5, "2026-12-05", "2026-12-05T01:00:00Z", { payMethod: "online", payProvider: "stripe" }),
      job(1, "Done", 200, "2026-12-08", "2026-12-08T01:00:00Z"),
      job(1, "Job Scheduled", 150, "2026-12-20", "2026-12-01T01:00:00Z"),
      job(1, "Paid", 99, "2026-11-04", "2026-11-05T01:00:00Z"), // same span last month (1 to 10 Nov)
      job(2, "Paid", 5000, "2026-12-02", "2026-12-02T01:00:00Z"), // another business
    ],
    quotes: [
      { businessId: 1, status: "Awaiting", price: 300, sentAt: at("2026-12-03T01:00:00Z"), statusChangedAt: at("2026-12-03T01:00:00Z"), createdAt: at("2026-12-03T01:00:00Z") },
      { businessId: 1, status: "Accepted", price: 150, sentAt: at("2026-12-01T01:00:00Z"), statusChangedAt: at("2026-12-04T01:00:00Z"), createdAt: at("2026-12-01T01:00:00Z") },
      { businessId: 1, status: "Declined", price: 90, sentAt: at("2026-12-02T01:00:00Z"), statusChangedAt: at("2026-12-06T01:00:00Z"), createdAt: at("2026-12-02T01:00:00Z") },
    ],
    staff: [{ businessId: 1, id: 5, name: "Priya", color: "#0C6FD0" }],
  };
}
const tix = (): TicketSummary[] => [
  { id: 11, subject: "Invoice won't send", status: "open", priority: "urgent", category: "invoices", lastMessage: "Still stuck", openedAt: at("2026-12-09T02:00:00Z"), updatedAt: at("2026-12-09T02:00:00Z"), solvedAt: null, businessId: 1, businessName: "Biz 1", assignedTo: null, assigneeName: null },
  { id: 12, subject: "Thanks!", status: "solved", priority: "low", category: "other", lastMessage: null, openedAt: at("2026-12-01T02:00:00Z"), updatedAt: at("2026-12-02T02:00:00Z"), solvedAt: at("2026-12-02T02:00:00Z"), businessId: 1, businessName: "Biz 1", assignedTo: 7, assigneeName: "Ryan" },
  { id: 13, subject: "Demo ticket", status: "open", priority: "high", category: "app", lastMessage: null, openedAt: at("2026-12-09T02:00:00Z"), updatedAt: at("2026-12-09T02:00:00Z"), solvedAt: null, businessId: 90, businessName: "Demo Co", assignedTo: null, assigneeName: null },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.customers = [cust(1), cust(2, { access: "trial", status: "trial", mrrCents: 0 }), cust(90, { demo: true, name: "Demo Co" })];
  state.rows = rows();
  state.tickets = tix();
  state.demoIds = [90];
});

const signed = () => {
  const ts = String(Math.floor(Date.now() / 1000));
  return { "x-lsp-timestamp": ts, "x-lsp-signature": `sha256=${signPayload(SECRET, ts, "")}` };
};
async function call(route: "customers" | "customer" | "tickets", query = "", headers: Record<string, string> = signed()) {
  const mod = await import(`../endpoints/integrations/sales-brain/${route}_GET.ts`);
  const res: Response = await mod.handle(new Request(`https://x/functions/v1/api/integrations/sales-brain/${route}${query}`, { headers }));
  return { status: res.status, body: await res.json() };
}

describe("signature on every read endpoint", () => {
  it("refuses unsigned, wrongly signed and stale requests", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    for (const route of ["customers", "customer", "tickets"] as const) {
      expect((await call(route, "?account_id=1", {})).status).toBe(401);
      expect((await call(route, "?account_id=1", { "x-lsp-timestamp": ts, "x-lsp-signature": `sha256=${signPayload("wrong", ts, "")}` })).status).toBe(401);
      const old = String(Number(ts) - 301);
      expect((await call(route, "?account_id=1", { "x-lsp-timestamp": old, "x-lsp-signature": `sha256=${signPayload(SECRET, old, "")}` })).status).toBe(401);
      expect((await call(route, "?account_id=1")).status).toBe(200);
    }
  });
});

describe("per-customer analytics", () => {
  it("are the customer's own dashboard numbers, in Brisbane time", () => {
    const r = rows();
    const mine = r.jobs.filter((j) => j.businessId === 1).map((j) => ({ ...j, statusChangedAt: brisbaneWall(j.statusChangedAt), createdAt: brisbaneWall(j.createdAt) }) as unknown as Job);
    const quotes = r.quotes.map((q) => ({ ...q, sentAt: q.sentAt && brisbaneWall(q.sentAt), statusChangedAt: brisbaneWall(q.statusChangedAt), createdAt: brisbaneWall(q.createdAt) }) as unknown as Quote);
    const dash = computeDashboard({ jobs: mine, quotes, staff: r.staff as unknown as StaffMember[] }, "month", brisbaneToday(NOW));
    expect(businessStats(r, 1, "month", NOW)).toEqual(dash);
  });

  it("add up right: only that business, money in cents", () => {
    const a = analytics(businessStats(rows(), 1, "month", NOW));
    expect(brisbaneToday(NOW)).toBe("2026-12-10");
    expect(a).toMatchObject({
      range: "month",
      collected_cents: 12000 + 8050, // the 1 Dec (Brisbane) payment counts; business 2's $5,000 doesn't
      collected_previous_period_cents: 9900,
      payments_collected: 2,
      jobs_completed: 2, // by job date in December: the 5th (paid) and the 8th (done)
      outstanding_cents: 20000,
      unpaid_jobs: 1,
      booked_ahead_cents: 15000,
      booked_ahead_jobs: 1,
      open_quotes: 1,
      open_quotes_cents: 30000,
      quotes_decided: 2,
      quotes_won: 1,
      quote_win_rate_pct: 50,
    });
    expect(a.payment_methods).toEqual(expect.arrayContaining([{ method: "Cash", cents: 12000 }, { method: "Stripe", cents: 8050 }]));
    expect(a.crew).toEqual([{ name: "Priya", jobs_completed: 2, cents: 28050 }]);
    expect(a.top_services).toEqual([{ service: "Mowing", cents: 28050, jobs: 2 }]);
  });

  it("leave out the win rate when no quote was decided", () => {
    const r = rows();
    r.quotes = [];
    expect("quote_win_rate_pct" in analytics(businessStats(r, 1, "month", NOW))).toBe(false);
  });
});

describe("GET customers", () => {
  it("lists every real customer with status and analytics; demo only when asked", async () => {
    const r = await call("customers");
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(2);
    expect(r.body.customers.map((c: { account_id: string }) => c.account_id)).toEqual(["1", "2"]);
    expect(r.body.customers[0]).toMatchObject({ business_name: "Biz 1", access: "paying", access_label: "Paying", status: "active", mrr_cents: 9900 });
    expect(r.body.customers[0].analytics.collected_cents).toBe(20050);
    expect(r.body.customers[1].analytics.collected_cents).toBe(500000);
    const withDemo = await call("customers", "?include_demo=1");
    expect(withDemo.body.count).toBe(3);
  });

  it("takes a range and refuses a wrong one", async () => {
    expect((await call("customers", "?range=fy")).body.customers[0].analytics.range).toBe("fy");
    expect((await call("customers", "?range=week")).status).toBe(400);
  });
});

describe("GET customer", () => {
  it("returns the account, billing, team, usage, analytics and tickets", async () => {
    const r = await call("customer", "?account_id=1&range=quarter");
    expect(r.status).toBe(200);
    expect(r.body.account).toMatchObject({ account_id: "1", business_name: "Biz 1" });
    expect(r.body.billing).toMatchObject({ subscription_status: "active", last_invoice_cents: 9900, lifetime_cents: 19800 });
    expect(r.body.team).toEqual([{ name: "Bob", email: "bob@x.au", role: "owner", joined_at: null }]);
    expect(r.body.analytics.range).toBe("quarter");
    expect(r.body.tickets.map((t: { ticket_id: string }) => t.ticket_id)).toEqual(["11", "12"]);
  });

  it("needs a valid account_id; demo customers are hidden unless asked", async () => {
    expect((await call("customer")).status).toBe(400);
    expect((await call("customer", "?account_id=404")).status).toBe(404);
    expect((await call("customer", "?account_id=90")).status).toBe(404);
    expect((await call("customer", "?account_id=90&include_demo=1")).status).toBe(200);
  });
});

describe("GET tickets", () => {
  it("lists real customers' tickets, filtered by status or account", async () => {
    const all = await call("tickets");
    expect(all.body.tickets.map((t: { ticket_id: string }) => t.ticket_id)).toEqual(["11", "12"]);
    const active = await call("tickets", "?status=active");
    expect(active.body.tickets).toHaveLength(1);
    expect(active.body.tickets[0]).toMatchObject({ ticket_id: "11", business: "Biz 1", priority: "urgent", topic: "Invoices & payments", waiting_hours: 24 });
    expect((await call("tickets", "?account_id=2")).body.count).toBe(0);
    expect((await call("tickets", "?status=lost")).status).toBe(400);
  });

  it("returns one ticket's conversation with internal notes marked", async () => {
    const r = await call("tickets", "?ticket_id=11");
    expect(r.body.ticket).toMatchObject({ ticket_id: "11", body: "Help" });
    expect(r.body.ticket.messages[0]).toMatchObject({ from: "staff", internal_note: true, body: "Looking now" });
    expect((await call("tickets", "?ticket_id=13")).status).toBe(404); // demo
  });
});

describe("ticket shape", () => {
  it("leaves waiting_hours off solved tickets", () => {
    expect("waiting_hours" in ticket(tix()[1], NOW)).toBe(false);
  });
});
