import { sql } from "kysely";
import { db } from "./db";
import { accountData, compActive, type AccountSource } from "./salesBrainEvents";
import { queueAccountSync } from "./salesBrain";
import { cancelSubscriptionNow, syncSubscription } from "./billing";
import { listTickets } from "./support";
import type { AdminCustomer, AdminCustomerDetail, AdminOverview, CustomerAccess } from "./adminShared";

// Server-only. The staff dashboard (/admin): every business with its status, revenue, usage and
// support load. Status and monthly revenue come from the same rules as the account.upserted events
// sent to Sales Brain (salesBrainEvents.accountData), so both always agree.

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
      .where("status", "in", ["open", "pending"])
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
  if (compActive(r.b)) return r.b.compSource === "salesbrain" ? "included" : "free";
  if (status === "active") return "paying";
  if (status === "past_due") return "past_due";
  if (status === "trial") return "trial";
  if (status === "paused") return "paused";
  return "none";
}

function toCustomer(r: Row): AdminCustomer {
  const d = accountData(r.src) as { status: string; plan: string; mrr_cents: number; cancel_reason: string | null };
  return {
    id: r.b.id,
    name: r.b.name,
    ownerName: r.src.ownerName,
    email: r.src.email,
    phone: r.src.phone,
    status: d.status,
    access: accessOf(r, d.status),
    plan: d.plan,
    mrrCents: d.mrr_cents,
    signedUpAt: r.b.createdAt,
    lastActiveAt: r.b.lastActiveAt,
    trialEndsAt: r.b.trialEndsAt,
    jobs30d: r.src.jobsLast30d,
    users: r.src.users,
    openTickets: r.openTickets,
    salesBrain: !!r.b.salesBrainCustomerId,
    cancelReason: d.cancel_reason,
  };
}

export async function listCustomers(): Promise<AdminCustomer[]> {
  return (await loadRows()).map(toCustomer);
}

export async function overview(): Promise<AdminOverview> {
  const customers = await listCustomers();
  const now = Date.now();
  const by = (a: CustomerAccess) => customers.filter((c) => c.access === a).length;
  const signedUpWithin = (from: number, to: number) => customers.filter((c) => now - new Date(c.signedUpAt).getTime() >= from && now - new Date(c.signedUpAt).getTime() < to).length;

  // Sign-ups per week, oldest first, for the last 12 weeks (week starting Monday).
  const weekStart = (d: Date) => {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.getTime();
  };
  const thisWeek = weekStart(new Date());
  const weeks = Array.from({ length: 12 }, (_, i) => thisWeek - (11 - i) * 7 * DAY);
  const signupsByWeek = weeks.map((w) => ({
    weekStart: new Date(w),
    count: customers.filter((c) => weekStart(new Date(c.signedUpAt)) === w).length,
  }));

  const [ticketCounts, frt, solved30, oldestOpen] = await Promise.all([
    db
      .selectFrom("supportTickets")
      .select([
        sql<string>`count(*) filter (where status = 'open')`.as("open"),
        sql<string>`count(*) filter (where status = 'pending')`.as("pending"),
        sql<string>`count(*) filter (where status in ('open','pending') and priority in ('urgent','high'))`.as("urgent"),
        sql<string>`count(*) filter (where status in ('open','pending') and assigned_to is null)`.as("unassigned"),
      ])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("supportTickets")
      .select(sql<string | null>`avg(extract(epoch from (first_response_at - opened_at)) / 3600)`.as("hours"))
      .where("openedAt", ">=", new Date(now - 30 * DAY))
      .where("firstResponseAt", "is not", null)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("supportTickets")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("solvedAt", ">=", new Date(now - 30 * DAY))
      .executeTakeFirstOrThrow(),
    db.selectFrom("supportTickets").select("updatedAt").where("status", "=", "open").orderBy("updatedAt").limit(1).executeTakeFirst(),
  ]);

  const soon = now + 7 * DAY;
  return {
    customers: customers.length,
    paying: by("paying"),
    trial: by("trial"),
    free: by("free"),
    included: by("included"),
    pastDue: by("past_due"),
    notSubscribed: by("none") + by("paused"),
    mrrCents: customers.filter((c) => c.access === "paying" || c.access === "past_due").reduce((s, c) => s + c.mrrCents, 0),
    signups30: signedUpWithin(0, 30 * DAY),
    signupsPrev30: signedUpWithin(30 * DAY, 60 * DAY),
    active7: customers.filter((c) => c.lastActiveAt && now - new Date(c.lastActiveAt).getTime() < 7 * DAY).length,
    jobs30: customers.reduce((s, c) => s + c.jobs30d, 0),
    signupsByWeek,
    trialsEnding: customers
      .filter((c) => c.access === "trial" && c.trialEndsAt && new Date(c.trialEndsAt).getTime() <= soon)
      .sort((a, b) => new Date(a.trialEndsAt!).getTime() - new Date(b.trialEndsAt!).getTime())
      .slice(0, 10),
    pastDueList: customers.filter((c) => c.access === "past_due").slice(0, 10),
    recentSignups: customers.slice(0, 8),
    support: {
      open: Number(ticketCounts.open),
      pending: Number(ticketCounts.pending),
      urgent: Number(ticketCounts.urgent),
      unassigned: Number(ticketCounts.unassigned),
      solved30: Number(solved30.n),
      avgFirstResponseHours: frt.hours == null ? null : Math.round(Number(frt.hours) * 10) / 10,
      oldestOpenAt: oldestOpen?.updatedAt ?? null,
    },
    recentTickets: await listTickets({ status: ["open", "pending"], limit: 6 }),
  };
}

export async function customerDetail(id: number): Promise<AdminCustomerDetail> {
  const [row] = await loadRows(id);
  if (!row) throw new Error("Customer not found");
  const since = new Date(Date.now() - 30 * DAY);
  const [members, invites, clients, quotes, jobsTotal, lastJob, tickets, notes] = await Promise.all([
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
  ]);
  const b = row.b;
  const sb = row.settingsBusiness;
  return {
    ...toCustomer(row),
    trade: b.trade,
    onboardedAt: b.onboardedAt,
    details: { abn: sb.abn ?? "", phone: sb.phone ?? "", email: sb.email ?? "", address: sb.address ?? "", website: sb.website ?? "", area: sb.area ?? "" },
    billing: {
      subscribedPlan: b.plan,
      subscriptionStatus: b.subscriptionStatus,
      stripeCustomerId: b.stripeCustomerId,
      stripeSubscriptionId: b.stripeSubscriptionId,
      currentPeriodEnd: b.currentPeriodEnd,
      cancelAtPeriodEnd: b.cancelAtPeriodEnd,
      cancelledAt: b.cancelledAt,
      comp: compActive(b),
      compSource: b.compSource,
      compNote: b.compNote,
      compEndsAt: b.compEndsAt,
      salesBrainCustomerId: b.salesBrainCustomerId,
      salesBrainPlan: b.salesBrainPlan,
      lastInvoiceCents: b.lastInvoiceCents,
    },
    members: members.map((m) => ({ id: m.id, name: m.displayName, email: m.email, role: m.role, joinedAt: m.createdAt })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, sentAt: i.createdAt, expiresAt: i.expiresAt })),
    usage: { clients: Number(clients.n), quotes: Number(quotes.n), jobs: Number(jobsTotal.n), jobs30d: row.src.jobsLast30d, lastJobAt: lastJob?.createdAt ?? null, since },
    tickets,
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, authorName: n.authorName ?? "Staff" })),
  };
}

export type CustomerAction =
  | { action: "comp_on"; note?: string; endsAt?: Date | null }
  | { action: "comp_off" }
  | { action: "extend_trial"; days: number }
  | { action: "cancel_subscription" }
  | { action: "note"; body: string }
  | { action: "delete_note"; noteId: number };

/** Staff changes to an account. Each one Sales Brain should know about queues account.upserted. */
export async function customerAction(id: number, staff: { id: number }, a: CustomerAction): Promise<string> {
  const b = await db.selectFrom("businesses").select(["id", "comp", "compSource", "trialEndsAt", "stripeSubscriptionId", "subscriptionStatus"]).where("id", "=", id).executeTakeFirst();
  if (!b) throw new Error("Customer not found");
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
      return ["active", "trialing", "past_due"].includes(b.subscriptionStatus ?? "") && b.stripeSubscriptionId
        ? "Free access is on. They still have a paid subscription: cancel it here if they shouldn't be charged."
        : "Free access is on.";
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
      if (!b.stripeSubscriptionId) throw new Error("There's no subscription to cancel.");
      await cancelSubscriptionNow(id);
      await syncSubscription(id).catch(() => undefined);
      return "Subscription cancelled now. No further charges.";
    case "note":
      await db.insertInto("customerNotes").values({ businessId: id, authorId: staff.id, body: a.body.trim() }).execute();
      return "Note added.";
    case "delete_note":
      await db.deleteFrom("customerNotes").where("id", "=", a.noteId).where("businessId", "=", id).execute();
      return "Note deleted.";
  }
}
