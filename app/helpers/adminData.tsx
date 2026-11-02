import { sql } from "kysely";
import { db } from "./db";
import { accountData, compActive, type AccountSource } from "./salesBrainEvents";
import { queueAccountClosed, queueAccountSync } from "./salesBrain";
import { cancelSubscriptionNow, syncSubscription } from "./billing";
import { isStripeConfigured } from "./stripeConnect";
import { deleteFolder } from "./storage";
import { AUTH_URL, env } from "./serverEnv";
import { listStaff, listTickets } from "./support";
import type { AdminCustomer, AdminCustomerDetail, AdminOverview, CustomerAccess, SupportOverview } from "./adminShared";
import type { OpsRows } from "./salesBrainCustomers";
import { DAY, computeOverview, computeSupport, loadWindow, type MetricsData } from "./adminMetrics";

// Server-only. The staff admin (/admin): every business with its status, revenue, usage and support
// load. Status and monthly revenue come from the same rules as the account.upserted events sent to
// Sales Brain (salesBrainEvents.accountData), so both always agree. Revenue history comes from the
// payments ledger (hso.billing_payments), filled from Stripe's invoice and refund events.

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

/**
 * Everything the Dashboard and Support overview compute from, for a period of `days`.
 * The maths is in adminMetrics.tsx, shared with Sales Brain's summary.
 */
export async function loadMetrics(days = 30): Promise<MetricsData> {
  const now = Date.now();
  const { paymentsSince, ticketsSince } = loadWindow(days, now);
  const [customers, payments, lifetime, jobsPrev, tickets, activeTickets, staff] = await Promise.all([
    listCustomers(),
    db
      .selectFrom("billingPayments as p")
      .innerJoin("businesses as b", "b.id", "p.businessId")
      .select(["p.id", "p.businessId", "b.name as businessName", "p.amountCents", "p.status", "p.kind", "p.description", "p.paidAt"])
      .where("p.paidAt", ">=", paymentsSince)
      .orderBy("p.paidAt", "desc")
      .execute(),
    db
      .selectFrom("billingPayments")
      .select(["businessId", sql<string>`coalesce(sum(case status when 'paid' then amount_cents when 'refunded' then -amount_cents else 0 end), 0)`.as("cents")])
      .groupBy("businessId")
      .execute(),
    db
      .selectFrom("jobs")
      .select(["businessId", (eb) => eb.fn.countAll<string>().as("n")])
      .where("status", "!=", "Cancelled")
      .where("scheduledDate", ">=", new Date(now - 60 * DAY))
      .where("scheduledDate", "<", new Date(now - 30 * DAY))
      .groupBy("businessId")
      .execute(),
    db
      .selectFrom("supportTickets")
      .select(["id", "businessId", "status", "priority", "category", "assignedTo", "openedAt", "solvedAt", "firstResponseAt"])
      .where((eb) => eb.or([eb("openedAt", ">=", ticketsSince), eb("solvedAt", ">=", ticketsSince), eb("status", "in", ["open", "in_progress", "pending"])]))
      .execute(),
    listTickets({ status: ["open", "in_progress", "pending"], limit: 300 }),
    listStaff(),
  ]);
  return {
    customers,
    payments,
    lifetime: lifetime.map((l) => ({ businessId: l.businessId, cents: Number(l.cents) })),
    jobsPrev: jobsPrev.map((j) => ({ businessId: j.businessId, n: Number(j.n) })),
    tickets,
    activeTickets,
    staff,
  };
}

export async function overview(): Promise<AdminOverview> {
  return computeOverview(await loadMetrics(30));
}

export async function supportOverview(): Promise<SupportOverview> {
  return computeSupport(await loadMetrics(30));
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

/** Jobs, quotes and crew of the given businesses: what their own dashboards compute from. */
export async function loadOpsRows(businessIds: number[]): Promise<OpsRows> {
  if (!businessIds.length) return { jobs: [], quotes: [], staff: [] };
  const [jobs, quotes, staff] = await Promise.all([
    db
      .selectFrom("jobs")
      .select(["businessId", "status", "price", "statusChangedAt", "createdAt", "payMethod", "payProvider", "service", "staffId", "source"])
      .select(sql<string | null>`to_char(scheduled_date, 'YYYY-MM-DD')`.as("scheduledDate"))
      .where("businessId", "in", businessIds)
      .execute(),
    db.selectFrom("quotes").select(["businessId", "status", "price", "sentAt", "statusChangedAt", "createdAt"]).where("businessId", "in", businessIds).execute(),
    db.selectFrom("staff").select(["businessId", "id", "name", "color"]).where("businessId", "in", businessIds).orderBy("id").execute(),
  ]);
  return {
    jobs: jobs.map((j) => ({ ...j, price: Number(j.price) || 0 })),
    quotes: quotes.map((q) => ({ ...q, price: Number(q.price) || 0 })),
    staff,
  };
}
