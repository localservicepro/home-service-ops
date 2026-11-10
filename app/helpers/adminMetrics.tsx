import type { AdminCustomer, AdminOverview, AdminPayment, CustomerAccess, Point, SupportOverview } from "./adminShared";
import type { TicketSummary } from "./supportShared";

// Server-only, no I/O: the maths behind the staff Dashboard and Support overview. adminData.tsx
// loads the rows; the admin pages and Sales Brain's summary (salesBrainSummary.tsx) both compute
// from here, so they always say the same thing.

export const DAY = 86_400_000;

export type TicketRow = {
  id: number;
  businessId: number;
  status: string;
  priority: string;
  category: string;
  assignedTo: number | null;
  openedAt: Date;
  solvedAt: Date | null;
  firstResponseAt: Date | null;
};

export type MetricsData = {
  customers: AdminCustomer[];
  /** Ledger rows in the loaded window, newest first. */
  payments: AdminPayment[];
  /** Paid minus refunded, all time, per business. */
  lifetime: { businessId: number; cents: number }[];
  /** Jobs scheduled 30 to 60 days ago, per business. */
  jobsPrev: { businessId: number; n: number }[];
  /** Tickets opened or solved in the loaded window, plus every one still being worked on. */
  tickets: TicketRow[];
  /** Tickets still being worked on, urgent first then most recently active (listTickets order). */
  activeTickets: TicketSummary[];
  staff: { id: number; displayName: string }[];
};

export type MetricsOptions = { now?: number; days?: number };

/** How far back the loader must reach for a period of `days`. */
export function loadWindow(days: number, now = Date.now()) {
  return {
    paymentsSince: new Date(Math.min(startOfMonth(now, 12), now - 2 * days * DAY)),
    ticketsSince: new Date(now - Math.max(days, 14) * DAY),
  };
}

/** The same data without demo customers (Admin → Demo data) or anything that belongs to them. */
export function withoutDemo(d: MetricsData): MetricsData {
  const demo = new Set(d.customers.filter((c) => c.demo).map((c) => c.id));
  if (!demo.size) return d;
  const keep = <T extends { businessId: number }>(xs: T[]) => xs.filter((x) => !demo.has(x.businessId));
  return {
    customers: d.customers.filter((c) => !c.demo),
    payments: keep(d.payments),
    lifetime: keep(d.lifetime),
    jobsPrev: keep(d.jobsPrev),
    tickets: keep(d.tickets),
    activeTickets: keep(d.activeTickets),
    staff: d.staff,
  };
}

export const HAS_ACCESS: CustomerAccess[] = ["paying", "past_due", "trial", "included", "free"];
const ACTIVE = ["open", "in_progress", "pending"];
const isSolved = (s: string) => s === "solved" || s === "closed";

// Day, week and month boundaries in Brisbane time (UTC+10, no daylight saving), where the
// business and its customers are, rather than the server's UTC.
const TZ = 10 * 3_600_000;
export function startOfDay(t: number) {
  return Math.floor((t + TZ) / DAY) * DAY - TZ;
}
function startOfWeek(t: number) {
  const d = startOfDay(t);
  const dow = new Date(d + TZ).getUTCDay(); // 0 = Sunday
  return d - ((dow + 6) % 7) * DAY;
}
export function startOfMonth(t: number, back = 0) {
  const d = new Date(t + TZ);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1) - TZ;
}

/** Buckets dates into a series: daily (n days), weekly (n weeks) or monthly (n months), oldest first. */
function series(now: number, dates: number[], unit: "day" | "week" | "month", n: number, weight?: (i: number) => number): Point[] {
  const starts =
    unit === "month"
      ? Array.from({ length: n }, (_, i) => startOfMonth(now, n - 1 - i))
      : Array.from({ length: n }, (_, i) => (unit === "day" ? startOfDay(now) - (n - 1 - i) * DAY : startOfWeek(now) - (n - 1 - i) * 7 * DAY));
  const values = new Array(n).fill(0);
  dates.forEach((t, idx) => {
    for (let i = n - 1; i >= 0; i--) {
      if (t >= starts[i]) {
        if (i === n - 1 || t < starts[i + 1] || unit === "month") values[i] += weight ? weight(idx) : 1;
        break;
      }
    }
  });
  return starts.map((s, i) => ({ at: new Date(s), value: values[i] }));
}

const ts = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The Dashboard. `days` is the comparison period (the page uses 30). */
export function computeOverview(data: MetricsData, opts: MetricsOptions = {}): AdminOverview {
  const now = opts.now ?? Date.now();
  const P = (opts.days ?? 30) * DAY;
  const { customers, payments } = data;
  const by = (a: CustomerAccess) => customers.filter((c) => c.access === a).length;
  const within = (d: Date | string | null, from: number, to: number) => !!d && now - ts(d) >= from && now - ts(d) < to;

  const paid = payments.filter((p) => p.status === "paid");
  const refunded = payments.filter((p) => p.status === "refunded");
  const failed = payments.filter((p) => p.status === "failed");
  // The last 12 full months, plus this month once it's a week in (a near-empty last point reads as a crash).
  const showCurrent = now - startOfMonth(now) >= 6 * DAY;
  const monthStarts = Array.from({ length: 12 }, (_, i) => startOfMonth(now, (showCurrent ? 11 : 12) - i));
  const monthEnd = showCurrent ? now + 1 : startOfMonth(now);
  const monthOf = (t: number) => {
    if (t >= monthEnd) return -1;
    for (let i = 11; i >= 0; i--) if (t >= monthStarts[i]) return i;
    return -1;
  };
  const revenueMonthly = monthStarts.map((m) => ({ at: new Date(m), paidCents: 0, refundedCents: 0, failedCents: 0, payments: 0 }));
  for (const p of payments) {
    const i = monthOf(ts(p.paidAt));
    if (i < 0) continue;
    if (p.status === "paid") {
      revenueMonthly[i].paidCents += p.amountCents;
      revenueMonthly[i].payments++;
    } else if (p.status === "refunded") revenueMonthly[i].refundedCents += p.amountCents;
    else if (p.status === "failed") revenueMonthly[i].failedCents += p.amountCents;
  }
  const net = (list: AdminPayment[], from: number, to: number) =>
    list.filter((p) => ts(p.paidAt) >= from && ts(p.paidAt) < to).reduce((s, p) => s + (p.status === "refunded" ? -p.amountCents : p.amountCents), 0);
  const paidOrRefunded = [...paid, ...refunded];

  const paying = customers.filter((c) => c.access === "paying" || c.access === "past_due");
  const mrrCents = paying.reduce((s, c) => s + c.mrrCents, 0);
  const withAccess = customers.filter((c) => HAS_ACCESS.includes(c.access));
  const churned = (from: number, to: number) => customers.filter((c) => c.status === "cancelled" && within(c.cancelledAt, from, to)).length;
  const churnedNow = churned(0, P);

  const planMap = new Map<string, { count: number; paying: number; mrrCents: number }>();
  for (const c of withAccess) {
    const k = c.access === "trial" ? "Trial" : c.plan;
    const e = planMap.get(k) ?? { count: 0, paying: 0, mrrCents: 0 };
    e.count++;
    if (c.access === "paying" || c.access === "past_due") {
      e.paying++;
      e.mrrCents += c.mrrCents;
    }
    planMap.set(k, e);
  }
  const tradeMap = new Map<string, number>();
  for (const c of customers) tradeMap.set(c.trade || "other", (tradeMap.get(c.trade || "other") ?? 0) + 1);
  const reasonMap = new Map<string, number>();
  for (const c of customers) {
    if (c.status !== "cancelled" || !within(c.cancelledAt, 0, 180 * DAY)) continue;
    const r = (c.cancelReason || "No reason given").split(":")[0].trim();
    reasonMap.set(r, (reasonMap.get(r) ?? 0) + 1);
  }

  const active = data.tickets.filter((t) => ACTIVE.includes(t.status));
  const replied = data.tickets.filter((t) => t.firstResponseAt && ts(t.openedAt) >= now - P);
  const frt = replied.length ? replied.reduce((s, t) => s + (ts(t.firstResponseAt) - ts(t.openedAt)) / 3_600_000, 0) / replied.length : null;

  const signupTimes = customers.map((c) => ts(c.signedUpAt));
  const soon = now + 7 * DAY;
  const periodFailed = failed.filter((p) => within(p.paidAt, 0, P));
  return {
    demo: customers.some((c) => c.demo),
    kpis: {
      mrrCents,
      arpaCents: paying.length ? Math.round(mrrCents / paying.length) : 0,
      paying: paying.length,
      revenue30Cents: net(paidOrRefunded, now - P, now + 1),
      revenuePrev30Cents: net(paidOrRefunded, now - 2 * P, now - P),
      withAccess: withAccess.length,
      withAccessPrev: withAccess.filter((c) => now - ts(c.signedUpAt) >= P).length + churnedNow,
      signups30: customers.filter((c) => within(c.signedUpAt, 0, P)).length,
      signupsPrev30: customers.filter((c) => within(c.signedUpAt, P, 2 * P)).length,
      churned30: churnedNow,
      churnedPrev30: churned(P, 2 * P),
      active7: customers.filter((c) => within(c.lastActiveAt, 0, 7 * DAY)).length,
      jobs30: customers.reduce((s, c) => s + c.jobs30d, 0),
      jobsPrev30: data.jobsPrev.reduce((s, j) => s + j.n, 0),
    },
    revenueMonthly,
    revenueDaily: series(
      now,
      paid.map((p) => ts(p.paidAt)),
      "day",
      30,
      (i) => paid[i].amountCents,
    ),
    signups: { daily: series(now, signupTimes, "day", 30), weekly: series(now, signupTimes, "week", 12), monthly: series(now, signupTimes, "month", 12) },
    mix: (["paying", "trial", "included", "free", "past_due", "suspended", "none"] as CustomerAccess[]).map((a) => ({
      access: a,
      count: a === "none" ? by("none") + by("paused") : by(a),
    })),
    plans: [...planMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count),
    trades: [...tradeMap.entries()].map(([trade, count]) => ({ trade, count })).sort((a, b) => b.count - a.count),
    activity: {
      today: customers.filter((c) => ts(c.lastActiveAt) >= startOfDay(now)).length,
      week: customers.filter((c) => within(c.lastActiveAt, 0, 7 * DAY)).length,
      month: customers.filter((c) => within(c.lastActiveAt, 0, 30 * DAY)).length,
      dormant: withAccess.filter((c) => !within(c.lastActiveAt, 0, 14 * DAY)).length,
    },
    payments: payments.slice(0, 12),
    paymentHealth: {
      failed30: periodFailed.length,
      failedCents30: periodFailed.reduce((s, p) => s + p.amountCents, 0),
      refundedCents30: refunded.filter((p) => within(p.paidAt, 0, P)).reduce((s, p) => s + p.amountCents, 0),
      lifetimeCents: data.lifetime.reduce((s, l) => s + l.cents, 0),
    },
    cancelReasons: [...reasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    trialsEnding: customers
      .filter((c) => c.access === "trial" && c.trialEndsAt && ts(c.trialEndsAt) <= soon)
      .sort((a, b) => ts(a.trialEndsAt) - ts(b.trialEndsAt))
      .slice(0, 8),
    pastDueList: customers.filter((c) => c.access === "past_due").slice(0, 8),
    recentSignups: customers.slice(0, 8),
    recentlyCancelled: customers
      .filter((c) => c.status === "cancelled" && c.cancelledAt)
      .sort((a, b) => ts(b.cancelledAt) - ts(a.cancelledAt))
      .slice(0, 6),
    support: {
      open: active.filter((t) => t.status === "open" || t.status === "in_progress").length,
      pending: active.filter((t) => t.status === "pending").length,
      urgent: active.filter((t) => t.priority === "urgent" || t.priority === "high").length,
      unassigned: active.filter((t) => t.assignedTo == null).length,
      solved30: data.tickets.filter((t) => t.solvedAt && ts(t.solvedAt) >= now - P).length,
      avgFirstResponseHours: frt == null ? null : round1(frt),
    },
    recentTickets: data.activeTickets.slice(0, 6),
  };
}

/** The Support overview. `days` is the period for solved, topics and average times (the page uses 30). */
export function computeSupport(data: MetricsData, opts: MetricsOptions = {}): SupportOverview {
  const now = opts.now ?? Date.now();
  const days = opts.days ?? 30;
  const recent = data.tickets;
  const active = recent.filter((t) => ACTIVE.includes(t.status));
  const inLast = (d: Date | null, n: number, offset = 0) => !!d && now - ts(d) >= offset * DAY && now - ts(d) < (n + offset) * DAY;
  const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const dayStarts = Array.from({ length: 14 }, (_, i) => startOfDay(now) - (13 - i) * DAY);
  const dayOf = (d: Date | null) => {
    const t = ts(d);
    for (let i = 13; i >= 0; i--) if (t >= dayStarts[i]) return i;
    return -1;
  };
  const daily = dayStarts.map((d) => ({ at: new Date(d), created: 0, solved: 0 }));
  for (const t of recent) {
    const c = dayOf(t.openedAt);
    if (c >= 0) daily[c].created++;
    const s = dayOf(t.solvedAt);
    if (s >= 0 && isSolved(t.status)) daily[s].solved++;
  }
  const cats = new Map<string, { open: number; total30: number }>();
  for (const t of recent) {
    const e = cats.get(t.category) ?? { open: 0, total30: 0 };
    if (!isSolved(t.status)) e.open++;
    if (inLast(t.openedAt, days)) e.total30++;
    cats.set(t.category, e);
  }
  return {
    open: active.filter((t) => t.status === "open" || t.status === "in_progress").length,
    pending: active.filter((t) => t.status === "pending").length,
    urgent: active.filter((t) => t.priority === "urgent" || t.priority === "high").length,
    unassigned: active.filter((t) => !t.assignedTo).length,
    created7: recent.filter((t) => inLast(t.openedAt, 7)).length,
    createdPrev7: recent.filter((t) => inLast(t.openedAt, 7, 7)).length,
    solved7: recent.filter((t) => isSolved(t.status) && inLast(t.solvedAt, 7)).length,
    solved30: recent.filter((t) => isSolved(t.status) && inLast(t.solvedAt, days)).length,
    avgFirstReplyHours: avg(recent.filter((t) => t.firstResponseAt && inLast(t.openedAt, days)).map((t) => (ts(t.firstResponseAt) - ts(t.openedAt)) / 3_600_000)),
    avgResolveHours: avg(recent.filter((t) => t.solvedAt && inLast(t.solvedAt, days)).map((t) => (ts(t.solvedAt) - ts(t.openedAt)) / 3_600_000)),
    daily,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total30 + b.open - (a.total30 + a.open)),
    byPriority: ["urgent", "high", "normal", "low"].map((p) => ({ priority: p, count: active.filter((t) => t.priority === p).length })),
    staff: data.staff.map((s) => ({
      id: s.id,
      name: s.displayName,
      open: active.filter((t) => t.assignedTo === s.id).length,
      solved30: recent.filter((t) => t.assignedTo === s.id && isSolved(t.status) && inLast(t.solvedAt, days)).length,
    })),
    oldest: data.activeTickets
      .filter((t) => t.status === "open" || t.status === "in_progress")
      .sort((a, b) => ts(a.updatedAt) - ts(b.updatedAt))
      .slice(0, 6),
  };
}
