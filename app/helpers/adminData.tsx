import { sql } from "kysely";
import { db } from "./db";
import { accountData, compActive, type AccountSource } from "./salesBrainEvents";
import { queueAccountClosed, queueAccountSync } from "./salesBrain";
import { cancelSubscriptionNow, syncSubscription } from "./billing";
import { isStripeConfigured } from "./stripeConnect";
import { deleteFolder } from "./storage";
import { AUTH_URL, env } from "./serverEnv";
import { listStaff, listTickets } from "./support";
import type { AdminCustomer, AdminCustomerDetail, AdminOverview, AdminPayment, CustomerAccess, Point, SupportOverview } from "./adminShared";

// Server-only. The staff admin (/admin): every business with its status, revenue, usage and support
// load. Status and monthly revenue come from the same rules as the account.upserted events sent to
// Sales Brain (salesBrainEvents.accountData), so both always agree. Revenue history comes from the
// payments ledger (hso.billing_payments), filled from Stripe's invoice and refund events.

const DAY = 86_400_000;

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(onlyId?: number) {
  let bq = db.selectFrom("businesses").selectAll().orderBy("createdAt", "desc");
  if (onlyId) bq = bq.where("id", "=", onlyId);
  const businesses = await bq.execute();
  if (!businesses.length) return [];
  const ids = businesses.map((b) => b.id);
  const since = new Date(Date.now() - 30 * DAY);
  const [owners, settings, jobs, members, tickets] = await Promise.all([
    db
      .selectFrom("memberships")
      .innerJoin("users", "users.id", "memberships.userId")
      .select(["memberships.businessId", "users.displayName", "users.email", "memberships.id"])
      .where("memberships.role", "=", "owner")
      .where("memberships.businessId", "in", ids)
      .orderBy("memberships.id")
      .execute(),
    db.selectFrom("settings").select(["businessId", "owner", "business"]).where("businessId", "in", ids).execute(),
    db
      .selectFrom("jobs")
      .select(["businessId", (eb) => eb.fn.countAll<string>().as("n")])
      .where("businessId", "in", ids)
      .where("status", "!=", "Cancelled")
      .where("scheduledDate", ">=", since)
      .where("scheduledDate", "<=", new Date())
      .groupBy("businessId")
      .execute(),
    db.selectFrom("memberships").select(["businessId", (eb) => eb.fn.countAll<string>().as("n")]).where("businessId", "in", ids).groupBy("businessId").execute(),
    db
      .selectFrom("supportTickets")
      .select(["businessId", (eb) => eb.fn.countAll<string>().as("n")])
      .where("businessId", "in", ids)
      .where("status", "in", ["open", "in_progress", "pending"])
      .groupBy("businessId")
      .execute(),
  ]);
  const ownerBy = new Map<number, (typeof owners)[number]>();
  for (const o of owners) if (!ownerBy.has(o.businessId)) ownerBy.set(o.businessId, o);
  const settingsBy = new Map(settings.map((s) => [s.businessId, s]));
  const count = (rows: { businessId: number; n: string }[]) => new Map(rows.map((r) => [r.businessId, Number(r.n)]));
  const jobsBy = count(jobs);
  const membersBy = count(members);
  const ticketsBy = count(tickets);

  return businesses.map((b) => {
    const o = ownerBy.get(b.id);
    const s = settingsBy.get(b.id);
    const so = (s?.owner ?? {}) as { first?: string; last?: string; email?: string; phone?: string };
    const sb = (s?.business ?? {}) as Record<string, string | undefined>;
    const src: AccountSource = {
      id: b.id,
      name: b.name,
      createdAt: b.createdAt,
      plan: b.plan,
      comp: b.comp,
      compSource: b.compSource,
      compEndsAt: b.compEndsAt,
      salesBrainCustomerId: b.salesBrainCustomerId,
      suspendedAt: b.suspendedAt,
      trialEndsAt: b.trialEndsAt,
      subscriptionStatus: b.subscriptionStatus,
      cancelAtPeriodEnd: b.cancelAtPeriodEnd,
      cancelledAt: b.cancelledAt,
      cancelReason: b.cancelReason,
      lastActiveAt: b.lastActiveAt,
      lastInvoiceCents: b.lastInvoiceCents,
      ownerName: o?.displayName || [so.first, so.last].filter(Boolean).join(" "),
      email: o?.email || so.email || sb.email || "",
      phone: so.phone || sb.phone || "",
      jobsLast30d: jobsBy.get(b.id) ?? 0,
      users: membersBy.get(b.id) ?? 0,
    };
    return { b, src, settingsBusiness: sb, openTickets: ticketsBy.get(b.id) ?? 0 };
  });
}

function accessOf(r: Row, status: string): CustomerAccess {
  if (r.b.suspendedAt) return "suspended";
  if (compActive(r.b)) return r.b.compSource === "salesbrain" ? "included" : "free";
  if (status === "active") return "paying";
  if (status === "past_due") return "past_due";
  if (status === "trial") return "trial";
  if (status === "paused") return "paused";
  return "none";
}

function toCustomer(r: Row): AdminCustomer {
  const d = accountData(r.src) as { status: string; plan: string; mrr_cents: number; cancel_reason: string | null; cancelled_at: string | null };
  const access = accessOf(r, d.status);
  return {
    id: r.b.id,
    name: r.b.name,
    ownerName: r.src.ownerName,
    email: r.src.email,
    phone: r.src.phone,
    status: d.status,
    access,
    plan: d.plan,
    trade: r.b.trade,
    // A suspended account isn't counted as revenue.
    mrrCents: access === "suspended" ? 0 : d.mrr_cents,
    signedUpAt: r.b.createdAt,
    lastActiveAt: r.b.lastActiveAt,
    trialEndsAt: r.b.trialEndsAt,
    cancelledAt: d.cancelled_at ? new Date(d.cancelled_at) : null,
    jobs30d: r.src.jobsLast30d,
    users: r.src.users,
    openTickets: r.openTickets,
    salesBrain: !!r.b.salesBrainCustomerId,
    cancelReason: d.cancel_reason,
    demo: r.b.isDemo,
  };
}

export async function listCustomers(): Promise<AdminCustomer[]> {
  return (await loadRows()).map(toCustomer);
}

const HAS_ACCESS: CustomerAccess[] = ["paying", "past_due", "trial", "included", "free"];

// Day, week and month boundaries in Brisbane time (UTC+10, no daylight saving), where the
// business and its customers are, rather than the server's UTC.
const TZ = 10 * 3_600_000;
function startOfDay(t: number) {
  return Math.floor((t + TZ) / DAY) * DAY - TZ;
}
function startOfWeek(t: number) {
  const d = startOfDay(t);
  const dow = new Date(d + TZ).getUTCDay(); // 0 = Sunday
  return d - ((dow + 6) % 7) * DAY;
}
function startOfMonth(t: number, back = 0) {
  const d = new Date(t + TZ);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1) - TZ;
}

/** Buckets dates into a series: daily (n days), weekly (n weeks) or monthly (n months), oldest first. */
function series(dates: number[], unit: "day" | "week" | "month", n: number, weight?: (i: number) => number): Point[] {
  const now = Date.now();
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

async function ledger(since: Date) {
  return db
    .selectFrom("billingPayments as p")
    .innerJoin("businesses as b", "b.id", "p.businessId")
    .select(["p.id", "p.businessId", "b.name as businessName", "p.amountCents", "p.status", "p.kind", "p.description", "p.paidAt"])
    .where("p.paidAt", ">=", since)
    .orderBy("p.paidAt", "desc")
    .execute();
}

export async function overview(): Promise<AdminOverview> {
  const customers = await listCustomers();
  const now = Date.now();
  const ts = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);
  const by = (a: CustomerAccess) => customers.filter((c) => c.access === a).length;
  const within = (d: Date | string | null, from: number, to: number) => !!d && now - ts(d) >= from && now - ts(d) < to;

  const payments = await ledger(new Date(Math.min(startOfMonth(now, 12), now - 60 * DAY)));
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
  const net = (list: typeof payments, from: number, to: number) =>
    list.filter((p) => ts(p.paidAt) >= from && ts(p.paidAt) < to).reduce((s, p) => s + (p.status === "refunded" ? -p.amountCents : p.amountCents), 0);
  const paidOrRefunded = [...paid, ...refunded];

  const paying = customers.filter((c) => c.access === "paying" || c.access === "past_due");
  const mrrCents = paying.reduce((s, c) => s + c.mrrCents, 0);
  const withAccess = customers.filter((c) => HAS_ACCESS.includes(c.access));
  const churned = (from: number, to: number) => customers.filter((c) => c.status === "cancelled" && within(c.cancelledAt, from, to)).length;
  const churned30 = churned(0, 30 * DAY);

  const jobsPrev = await db
    .selectFrom("jobs")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("status", "!=", "Cancelled")
    .where("scheduledDate", ">=", new Date(now - 60 * DAY))
    .where("scheduledDate", "<", new Date(now - 30 * DAY))
    .executeTakeFirstOrThrow();

  const planMap = new Map<string, { count: number; mrrCents: number }>();
  for (const c of withAccess) {
    const k = c.access === "trial" ? "Trial" : c.plan;
    const e = planMap.get(k) ?? { count: 0, mrrCents: 0 };
    e.count++;
    e.mrrCents += c.access === "paying" || c.access === "past_due" ? c.mrrCents : 0;
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

  const signupTimes = customers.map((c) => ts(c.signedUpAt));
  const soon = now + 7 * DAY;
  const [ticketCounts, frt, solved30] = await Promise.all([
    db
      .selectFrom("supportTickets")
      .select([
        sql<string>`count(*) filter (where status in ('open','in_progress'))`.as("open"),
        sql<string>`count(*) filter (where status = 'pending')`.as("pending"),
        sql<string>`count(*) filter (where status in ('open','in_progress','pending') and priority in ('urgent','high'))`.as("urgent"),
        sql<string>`count(*) filter (where status in ('open','in_progress','pending') and assigned_to is null)`.as("unassigned"),
      ])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("supportTickets")
      .select(sql<string | null>`avg(extract(epoch from (first_response_at - opened_at)) / 3600)`.as("hours"))
      .where("openedAt", ">=", new Date(now - 30 * DAY))
      .where("firstResponseAt", "is not", null)
      .executeTakeFirstOrThrow(),
    db.selectFrom("supportTickets").select((eb) => eb.fn.countAll<string>().as("n")).where("solvedAt", ">=", new Date(now - 30 * DAY)).executeTakeFirstOrThrow(),
  ]);
  const lifetime = await db
    .selectFrom("billingPayments")
    .select(sql<string>`coalesce(sum(case status when 'paid' then amount_cents when 'refunded' then -amount_cents else 0 end), 0)`.as("cents"))
    .executeTakeFirstOrThrow();

  const toPayment = (p: (typeof payments)[number]): AdminPayment => ({ ...p });
  return {
    demo: customers.some((c) => c.demo),
    kpis: {
      mrrCents,
      arpaCents: paying.length ? Math.round(mrrCents / paying.length) : 0,
      paying: paying.length,
      revenue30Cents: net(paidOrRefunded, now - 30 * DAY, now + 1),
      revenuePrev30Cents: net(paidOrRefunded, now - 60 * DAY, now - 30 * DAY),
      withAccess: withAccess.length,
      withAccessPrev: withAccess.filter((c) => now - ts(c.signedUpAt) >= 30 * DAY).length + churned30,
      signups30: customers.filter((c) => within(c.signedUpAt, 0, 30 * DAY)).length,
      signupsPrev30: customers.filter((c) => within(c.signedUpAt, 30 * DAY, 60 * DAY)).length,
      churned30,
      churnedPrev30: churned(30 * DAY, 60 * DAY),
      active7: customers.filter((c) => within(c.lastActiveAt, 0, 7 * DAY)).length,
      jobs30: customers.reduce((s, c) => s + c.jobs30d, 0),
      jobsPrev30: Number(jobsPrev.n),
    },
    revenueMonthly,
    revenueDaily: series(
      paid.map((p) => ts(p.paidAt)),
      "day",
      30,
      (i) => paid[i].amountCents,
    ),
    signups: { daily: series(signupTimes, "day", 30), weekly: series(signupTimes, "week", 12), monthly: series(signupTimes, "month", 12) },
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
    payments: payments.slice(0, 12).map(toPayment),
    paymentHealth: {
      failed30: failed.filter((p) => within(p.paidAt, 0, 30 * DAY)).length,
      failedCents30: failed.filter((p) => within(p.paidAt, 0, 30 * DAY)).reduce((s, p) => s + p.amountCents, 0),
      refundedCents30: refunded.filter((p) => within(p.paidAt, 0, 30 * DAY)).reduce((s, p) => s + p.amountCents, 0),
      lifetimeCents: Number(lifetime.cents),
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
      open: Number(ticketCounts.open),
      pending: Number(ticketCounts.pending),
      urgent: Number(ticketCounts.urgent),
      unassigned: Number(ticketCounts.unassigned),
      solved30: Number(solved30.n),
      avgFirstResponseHours: frt.hours == null ? null : Math.round(Number(frt.hours) * 10) / 10,
    },
    recentTickets: await listTickets({ status: ["open", "in_progress", "pending"], limit: 6 }),
  };
}

export async function supportOverview(): Promise<SupportOverview> {
  const now = Date.now();
  const since = new Date(now - 30 * DAY);
  const recent = await db
    .selectFrom("supportTickets")
    .select(["id", "status", "priority", "category", "assignedTo", "openedAt", "solvedAt", "firstResponseAt"])
    .where((eb) => eb.or([eb("openedAt", ">=", since), eb("solvedAt", ">=", since), eb("status", "in", ["open", "in_progress", "pending"])]))
    .execute();
  const ts = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  const active = recent.filter((t) => t.status === "open" || t.status === "in_progress" || t.status === "pending");
  const inLast = (d: Date | null, days: number, offset = 0) => !!d && now - ts(d) >= offset * DAY && now - ts(d) < (days + offset) * DAY;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const days = Array.from({ length: 14 }, (_, i) => startOfDay(now) - (13 - i) * DAY);
  const dayOf = (d: Date | null) => {
    const t = ts(d);
    for (let i = 13; i >= 0; i--) if (t >= days[i]) return i;
    return -1;
  };
  const daily = days.map((d) => ({ at: new Date(d), created: 0, solved: 0 }));
  for (const t of recent) {
    const c = dayOf(t.openedAt);
    if (c >= 0) daily[c].created++;
    const s = dayOf(t.solvedAt);
    if (s >= 0 && (t.status === "solved" || t.status === "closed")) daily[s].solved++;
  }
  const cats = new Map<string, { open: number; total30: number }>();
  for (const t of recent) {
    const e = cats.get(t.category) ?? { open: 0, total30: 0 };
    if (t.status !== "solved" && t.status !== "closed") e.open++;
    if (inLast(t.openedAt, 30)) e.total30++;
    cats.set(t.category, e);
  }
  const staff = await listStaff();
  return {
    open: active.filter((t) => t.status === "open" || t.status === "in_progress").length,
    pending: active.filter((t) => t.status === "pending").length,
    urgent: active.filter((t) => t.priority === "urgent" || t.priority === "high").length,
    unassigned: active.filter((t) => !t.assignedTo).length,
    created7: recent.filter((t) => inLast(t.openedAt, 7)).length,
    createdPrev7: recent.filter((t) => inLast(t.openedAt, 7, 7)).length,
    solved7: recent.filter((t) => (t.status === "solved" || t.status === "closed") && inLast(t.solvedAt, 7)).length,
    solved30: recent.filter((t) => (t.status === "solved" || t.status === "closed") && inLast(t.solvedAt, 30)).length,
    avgFirstReplyHours: avg(recent.filter((t) => t.firstResponseAt && inLast(t.openedAt, 30)).map((t) => (ts(t.firstResponseAt) - ts(t.openedAt)) / 3_600_000)),
    avgResolveHours: avg(recent.filter((t) => t.solvedAt && inLast(t.solvedAt, 30)).map((t) => (ts(t.solvedAt) - ts(t.openedAt)) / 3_600_000)),
    daily,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total30 + b.open - (a.total30 + a.open)),
    byPriority: ["urgent", "high", "normal", "low"].map((p) => ({ priority: p, count: active.filter((t) => t.priority === p).length })),
    staff: staff.map((s) => ({
      id: s.id,
      name: s.displayName,
      open: active.filter((t) => t.assignedTo === s.id).length,
      solved30: recent.filter((t) => t.assignedTo === s.id && (t.status === "solved" || t.status === "closed") && inLast(t.solvedAt, 30)).length,
    })),
    oldest: (await listTickets({ status: ["open", "in_progress"], limit: 300 })).sort((a, b) => ts(a.updatedAt) - ts(b.updatedAt)).slice(0, 6),
  };
}

export async function customerDetail(id: number): Promise<AdminCustomerDetail> {
  const [row] = await loadRows(id);
  if (!row) throw new Error("Customer not found");
  const [members, invites, clients, quotes, jobsTotal, lastJob, tickets, notes, payments] = await Promise.all([
    db
      .selectFrom("memberships")
      .innerJoin("users", "users.id", "memberships.userId")
      .select(["users.id", "users.displayName", "users.email", "memberships.role", "memberships.createdAt"])
      .where("memberships.businessId", "=", id)
      .orderBy("memberships.id")
      .execute(),
    db
      .selectFrom("invites")
      .select(["id", "email", "role", "createdAt", "expiresAt"])
      .where("businessId", "=", id)
      .where("acceptedAt", "is", null)
      .where("expiresAt", ">", new Date())
      .execute(),
    db.selectFrom("clients").select((eb) => eb.fn.countAll<string>().as("n")).where("businessId", "=", id).executeTakeFirstOrThrow(),
    db.selectFrom("quotes").select((eb) => eb.fn.countAll<string>().as("n")).where("businessId", "=", id).executeTakeFirstOrThrow(),
    db.selectFrom("jobs").select((eb) => eb.fn.countAll<string>().as("n")).where("businessId", "=", id).executeTakeFirstOrThrow(),
    db.selectFrom("jobs").select("createdAt").where("businessId", "=", id).orderBy("createdAt", "desc").limit(1).executeTakeFirst(),
    listTickets({ businessId: id, limit: 50 }),
    db
      .selectFrom("customerNotes as n")
      .leftJoin("users as u", "u.id", "n.authorId")
      .select(["n.id", "n.body", "n.createdAt", "u.displayName as authorName"])
      .where("n.businessId", "=", id)
      .orderBy("n.createdAt", "desc")
      .execute(),
    db
      .selectFrom("billingPayments as p")
      .innerJoin("businesses as b", "b.id", "p.businessId")
      .select(["p.id", "p.businessId", "b.name as businessName", "p.amountCents", "p.status", "p.kind", "p.description", "p.paidAt"])
      .where("p.businessId", "=", id)
      .orderBy("p.paidAt", "desc")
      .limit(50)
      .execute(),
  ]);
  const sessions = await db
    .selectFrom("supportSessions as s")
    .innerJoin("users as u", "u.id", "s.staffId")
    .select((eb) => [
      "s.id", "u.displayName as staffName", "s.reason", "s.allowChanges", "s.startedAt", "s.endedAt", "s.expiresAt",
      eb.selectFrom("supportSessionActions as a").select((x) => x.fn.countAll<string>().as("n")).whereRef("a.sessionId", "=", "s.id").as("changes"),
    ])
    .where("s.businessId", "=", id)
    .orderBy("s.startedAt", "desc")
    .limit(20)
    .execute();
  const b = row.b;
  const sb = row.settingsBusiness;
  return {
    ...toCustomer(row),
    supportSessions: sessions.map((s) => ({ ...s, changes: Number(s.changes ?? 0) })),
    onboardedAt: b.onboardedAt,
    suspendedAt: b.suspendedAt,
    suspendedReason: b.suspendedReason,
    details: { abn: sb.abn ?? "", phone: sb.phone ?? "", email: sb.email ?? "", address: sb.address ?? "", website: sb.website ?? "", area: sb.area ?? "" },
    billing: {
      subscribedPlan: b.plan,
      subscriptionStatus: b.subscriptionStatus,
      stripeCustomerId: b.stripeCustomerId,
      stripeSubscriptionId: b.stripeSubscriptionId,
      currentPeriodEnd: b.currentPeriodEnd,
      cancelAtPeriodEnd: b.cancelAtPeriodEnd,
      comp: compActive(b),
      compSource: b.compSource,
      compNote: b.compNote,
      compEndsAt: b.compEndsAt,
      salesBrainCustomerId: b.salesBrainCustomerId,
      salesBrainPlan: b.salesBrainPlan,
      lastInvoiceCents: b.lastInvoiceCents,
      lifetimeCents: payments.reduce((s, p) => s + (p.status === "paid" ? p.amountCents : p.status === "refunded" ? -p.amountCents : 0), 0),
    },
    payments,
    members: members.map((m) => ({ id: m.id, name: m.displayName, email: m.email, role: m.role, joinedAt: m.createdAt })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, sentAt: i.createdAt, expiresAt: i.expiresAt })),
    usage: { clients: Number(clients.n), quotes: Number(quotes.n), jobs: Number(jobsTotal.n), jobs30d: row.src.jobsLast30d, lastJobAt: lastJob?.createdAt ?? null },
    tickets,
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, authorName: n.authorName ?? "Staff" })),
  };
}

/**
 * Deletes a business and everything in it. Logins that belong to no other business are deleted too
 * (never a Local Service Pro staff login). Billing stops first; if Stripe can't be reached, nothing
 * is deleted.
 */
async function deleteCustomer(id: number) {
  const b = await db.selectFrom("businesses").select(["id", "isDemo", "stripeSubscriptionId"]).where("id", "=", id).executeTakeFirstOrThrow();
  const members = await db
    .selectFrom("memberships")
    .innerJoin("users", "users.id", "memberships.userId")
    .select(["users.id", "users.authId", "users.role"])
    .where("memberships.businessId", "=", id)
    .execute();
  if (!b.isDemo) {
    if (b.stripeSubscriptionId && isStripeConfigured()) await cancelSubscriptionNow(id);
    for (const folder of ["job-photos", "lead-photos", "form-logos"]) await deleteFolder(`${folder}/${id}`).catch(() => 0);
  }
  await db.transaction().execute(async (trx) => {
    await queueAccountClosed(trx, id);
    await trx.deleteFrom("businesses").where("id", "=", id).execute();
  });
  let logins = 0;
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  for (const m of members) {
    if (m.role === "admin") continue;
    const other = await db.selectFrom("memberships").select("id").where("userId", "=", m.id).executeTakeFirst();
    if (other) continue;
    const res = await fetch(`${AUTH_URL}/admin/users/${m.authId}`, { method: "DELETE", headers: { Authorization: `Bearer ${key}`, apikey: key } }).catch(() => null);
    if (res && (res.ok || res.status === 404)) {
      await db.deleteFrom("users").where("id", "=", m.id).execute();
      logins++;
    }
  }
  return logins;
}

export type CustomerAction =
  | { action: "comp_on"; note?: string; endsAt?: Date | null }
  | { action: "comp_off" }
  | { action: "extend_trial"; days: number }
  | { action: "cancel_subscription" }
  | { action: "suspend"; reason: string; cancelSubscription?: boolean }
  | { action: "reinstate" }
  | { action: "delete"; confirmName: string }
  | { action: "note"; body: string }
  | { action: "delete_note"; noteId: number };

/** Staff changes to an account. Each one Sales Brain should know about queues account.upserted. */
export async function customerAction(id: number, staff: { id: number }, a: CustomerAction): Promise<string> {
  const b = await db
    .selectFrom("businesses")
    .select(["id", "name", "comp", "compSource", "trialEndsAt", "stripeSubscriptionId", "subscriptionStatus", "isDemo", "suspendedAt"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!b) throw new Error("Customer not found");
  const live = !!b.stripeSubscriptionId && ["active", "trialing", "past_due", "unpaid"].includes(b.subscriptionStatus ?? "");
  const stopBilling = async () => {
    if (!live) return false;
    if (b.isDemo) {
      await db.updateTable("businesses").set({ subscriptionStatus: "canceled", cancelAtPeriodEnd: false, cancelledAt: new Date() }).where("id", "=", id).execute();
      return true;
    }
    await cancelSubscriptionNow(id);
    await syncSubscription(id).catch(() => undefined);
    return true;
  };
  switch (a.action) {
    case "comp_on":
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("businesses")
          .set({ comp: true, compSource: "staff", compNote: a.note?.trim() || null, compEndsAt: a.endsAt ?? null })
          .where("id", "=", id)
          .execute();
        await queueAccountSync(trx, id);
      });
      return live ? "Free access is on. They still have a paid subscription: cancel it here if they shouldn't be charged." : "Free access is on.";
    case "comp_off":
      await db.transaction().execute(async (trx) => {
        await trx.updateTable("businesses").set({ comp: false, compSource: null, compNote: null, compEndsAt: null }).where("id", "=", id).execute();
        await queueAccountSync(trx, id);
      });
      return "Free access is off. Without a subscription or trial the app asks them to choose a plan.";
    case "extend_trial": {
      const from = Math.max(Date.now(), b.trialEndsAt?.getTime() ?? 0);
      const until = new Date(from + a.days * DAY);
      await db.transaction().execute(async (trx) => {
        await trx.updateTable("businesses").set({ trialEndsAt: until }).where("id", "=", id).execute();
        await queueAccountSync(trx, id);
      });
      return `Trial now ends ${until.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" })}.`;
    }
    case "cancel_subscription":
      if (!(await stopBilling())) throw new Error("There's no active subscription to cancel.");
      return "Subscription cancelled now. No further charges.";
    case "suspend": {
      const stopped = a.cancelSubscription ? await stopBilling() : false;
      await db.transaction().execute(async (trx) => {
        await trx.updateTable("businesses").set({ suspendedAt: new Date(), suspendedReason: a.reason.trim() || null }).where("id", "=", id).execute();
        await queueAccountSync(trx, id);
      });
      await db.insertInto("customerNotes").values({ businessId: id, authorId: staff.id, body: `Suspended${a.reason.trim() ? `: ${a.reason.trim()}` : ""}${stopped ? " (subscription cancelled)" : ""}` }).execute();
      return `Access suspended. Nobody at ${b.name} can use the app until it's reinstated${stopped ? ", and their subscription is cancelled" : ""}.`;
    }
    case "reinstate":
      if (!b.suspendedAt) return "This account isn't suspended.";
      await db.transaction().execute(async (trx) => {
        await trx.updateTable("businesses").set({ suspendedAt: null, suspendedReason: null }).where("id", "=", id).execute();
        await queueAccountSync(trx, id);
      });
      await db.insertInto("customerNotes").values({ businessId: id, authorId: staff.id, body: "Access reinstated" }).execute();
      return "Access reinstated.";
    case "delete": {
      if (a.confirmName.trim().toLowerCase() !== b.name.trim().toLowerCase()) throw new Error("Type the business name exactly to confirm.");
      const logins = await deleteCustomer(id);
      return `${b.name} is deleted with all its data${logins ? ` and ${logins} login${logins === 1 ? "" : "s"}` : ""}.`;
    }
    case "note":
      await db.insertInto("customerNotes").values({ businessId: id, authorId: staff.id, body: a.body.trim() }).execute();
      return "Note added.";
    case "delete_note":
      await db.deleteFrom("customerNotes").where("id", "=", a.noteId).where("businessId", "=", id).execute();
      return "Note deleted.";
  }
}
