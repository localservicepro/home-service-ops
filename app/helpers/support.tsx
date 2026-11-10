import { sql } from "kysely";
import { db } from "./db";
import { env } from "./serverEnv";
import { esc, layout, sendAppEmail, EmailNotConfiguredError, linkBase } from "./mailer";
import { queueTicket } from "./salesBrain";
import { ForbiddenError } from "./tenant";
import { getServerUserSession } from "./getServerUserSession";
import type { TicketDetail, TicketPriority, TicketStatus, TicketSummary } from "./supportShared";

// Server-only. Support tickets: businesses send them from the Support button or Settings → Help &
// support; Local Service Pro staff (users.role = 'admin') answer in /admin. Staff can also start a
// conversation, assign tickets and leave internal notes, which customers never see. Every change
// the customer can see queues a ticket.upserted event for Sales Brain in the same transaction.

const supportInbox = () => env("SUPPORT_EMAIL") || "support@localservicepro.com.au";
const preview = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 500);

/** Local Service Pro staff only. */
export async function requirePlatformAdmin(request: Request) {
  const { user } = await getServerUserSession(request);
  if (user.role !== "admin") throw new ForbiddenError("This page is for Local Service Pro staff.");
  return user;
}

async function mail(to: string | null | undefined, subject: string, heading: string, paragraphs: string[], url?: string) {
  if (!to) return;
  await sendAppEmail({
    to,
    fromName: "Home Service Ops support",
    replyTo: supportInbox(),
    subject,
    html: layout({ brand: "Home Service Ops", heading, paragraphs, ...(url ? { cta: { label: "Open the conversation", url } } : {}) }),
    text: [heading, ...paragraphs.map((p) => p.replace(/<[^>]+>/g, "")), url ?? ""].join("\n\n"),
  }).catch((e) => {
    if (!(e instanceof EmailNotConfiguredError)) console.error("Support email failed", e instanceof Error ? e.message : e);
  });
}

/** Staff who can be assigned tickets. */
export async function listStaff() {
  return db.selectFrom("users").select(["id", "displayName", "email"]).where("role", "=", "admin").orderBy("displayName").execute();
}

export async function listTickets(opts: {
  businessId?: number;
  status?: string[];
  assignedTo?: number | "none";
  q?: string;
  limit?: number;
}): Promise<TicketSummary[]> {
  let q = db
    .selectFrom("supportTickets as t")
    .innerJoin("businesses as b", "b.id", "t.businessId")
    .leftJoin("users as a", "a.id", "t.assignedTo")
    .select([
      "t.id", "t.subject", "t.status", "t.priority", "t.category", "t.lastMessage", "t.openedAt", "t.updatedAt", "t.solvedAt",
      "t.businessId", "b.name as businessName", "t.assignedTo", "a.displayName as assigneeName", "t.firstResponseAt",
    ])
    // Urgent first within the same status, then most recently active.
    .orderBy(sql`case t.priority when 'urgent' then 0 when 'high' then 1 else 2 end`)
    .orderBy("t.updatedAt", "desc")
    .limit(opts.limit ?? 300);
  if (opts.businessId) q = q.where("t.businessId", "=", opts.businessId);
  if (opts.status?.length) q = q.where("t.status", "in", opts.status);
  if (opts.assignedTo === "none") q = q.where("t.assignedTo", "is", null);
  else if (opts.assignedTo) q = q.where("t.assignedTo", "=", opts.assignedTo);
  const term = opts.q?.trim();
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const asId = /^#?\d+$/.test(term) ? Number(term.replace("#", "")) : null;
    q = q.where((eb) =>
      eb.or([
        eb("t.subject", "ilike", like),
        eb("t.lastMessage", "ilike", like),
        eb("b.name", "ilike", like),
        ...(asId ? [eb("t.id", "=", asId), eb("t.businessId", "=", asId)] : []),
      ]),
    );
  }
  return q.execute();
}

/** One ticket. With businessId (the customer's own view) internal notes are left out. */
export async function getTicket(ticketId: number, businessId?: number): Promise<TicketDetail> {
  let q = db
    .selectFrom("supportTickets as t")
    .innerJoin("businesses as b", "b.id", "t.businessId")
    .leftJoin("users as u", "u.id", "t.createdBy")
    .leftJoin("users as a", "a.id", "t.assignedTo")
    .select([
      "t.id", "t.subject", "t.body", "t.status", "t.priority", "t.category", "t.lastMessage", "t.openedAt", "t.updatedAt", "t.solvedAt",
      "t.businessId", "b.name as businessName", "u.email as createdByEmail", "t.assignedTo", "a.displayName as assigneeName", "t.firstResponseAt",
    ])
    .where("t.id", "=", ticketId);
  if (businessId) q = q.where("t.businessId", "=", businessId);
  const t = await q.executeTakeFirst();
  if (!t) throw new Error("Ticket not found");
  let mq = db
    .selectFrom("supportMessages as m")
    .leftJoin("users as u", "u.id", "m.authorId")
    .select(["m.id", "m.body", "m.fromStaff", "m.internal", "m.createdAt", "u.displayName"])
    .where("m.ticketId", "=", ticketId)
    .orderBy("m.createdAt");
  if (businessId) mq = mq.where("m.internal", "=", false);
  const messages = await mq.execute();
  return {
    ...t,
    createdByEmail: t.createdByEmail ?? null,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      fromStaff: m.fromStaff,
      internal: m.internal,
      createdAt: m.createdAt,
      // Customers see "Local Service Pro support"; staff see who wrote it.
      authorName: m.fromStaff ? (businessId ? "Local Service Pro support" : `${m.displayName || "Staff"}${m.internal ? " (internal note)" : ""}`) : m.displayName || "Customer",
    })),
  };
}

export async function createTicket(
  ctx: { businessId: number; businessName: string; user: { id: number; email: string; displayName: string } },
  input: { subject: string; body: string; category: string; priority: TicketPriority },
  origin?: string,
) {
  const id = await db.transaction().execute(async (trx) => {
    const t = await trx
      .insertInto("supportTickets")
      .values({ businessId: ctx.businessId, createdBy: ctx.user.id, subject: input.subject, body: input.body, category: input.category, priority: input.priority, lastMessage: preview(input.body) })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx.insertInto("supportMessages").values({ ticketId: t.id, authorId: ctx.user.id, body: input.body }).execute();
    await queueTicket(trx, t.id);
    return t.id;
  });
  await mail(
    supportInbox(),
    `[#${id}] ${input.priority === "urgent" || input.priority === "high" ? `(${input.priority}) ` : ""}${input.subject} — ${ctx.businessName}`,
    `New support request #${id}`,
    [
      `<b>${esc(ctx.user.displayName)}</b> (${esc(ctx.user.email)}) at <b>${esc(ctx.businessName)}</b> wrote:`,
      esc(input.body).replace(/\n/g, "<br>"),
      `Category: ${esc(input.category)} · Priority: ${esc(input.priority)}`,
    ],
    origin ? `${linkBase(origin)}/admin?tab=support&t=${id}` : undefined,
  );
  return id;
}

/** Staff start a conversation with a business (sent to the owner, who replies in the app or by email). */
export async function createStaffTicket(
  staff: { id: number; displayName: string },
  input: { businessId: number; subject: string; body: string; category: string; priority: TicketPriority },
  origin?: string,
) {
  const owner = await db
    .selectFrom("memberships")
    .innerJoin("users", "users.id", "memberships.userId")
    .select(["users.id", "users.email", "users.displayName"])
    .where("memberships.businessId", "=", input.businessId)
    .where("memberships.role", "=", "owner")
    .orderBy("memberships.id")
    .executeTakeFirst();
  const id = await db.transaction().execute(async (trx) => {
    const now = new Date();
    const t = await trx
      .insertInto("supportTickets")
      .values({
        businessId: input.businessId,
        createdBy: owner?.id ?? null,
        subject: input.subject,
        body: input.body,
        category: input.category,
        priority: input.priority,
        status: "pending",
        lastMessage: preview(input.body),
        assignedTo: staff.id,
        firstResponseAt: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx.insertInto("supportMessages").values({ ticketId: t.id, authorId: staff.id, body: input.body, fromStaff: true }).execute();
    await queueTicket(trx, t.id);
    return t.id;
  });
  await mail(
    owner?.email,
    `${input.subject} [#${id}]`,
    "A message from Local Service Pro support",
    [`Hi ${esc(owner?.displayName.split(" ")[0] || "there")},`, esc(input.body).replace(/\n/g, "<br>")],
    origin ? `${linkBase(origin)}/support?t=${id}` : undefined,
  );
  return id;
}

/**
 * A reply from the business (reopens a solved ticket), a staff reply (waits on the customer unless
 * a status is given) or a staff internal note (no email, no status change, hidden from the customer).
 */
export async function addMessage(opts: {
  ticketId: number;
  author: { id: number; displayName: string; email: string };
  body: string;
  fromStaff: boolean;
  internal?: boolean;
  status?: TicketStatus;
  businessId?: number;
  origin?: string;
}) {
  const internal = opts.fromStaff && !!opts.internal;
  const t = await db.transaction().execute(async (trx) => {
    let q = trx.selectFrom("supportTickets").select(["id", "status", "subject", "businessId", "createdBy", "firstResponseAt", "assignedTo"]).where("id", "=", opts.ticketId);
    if (opts.businessId) q = q.where("businessId", "=", opts.businessId);
    const cur = await q.executeTakeFirst();
    if (!cur) throw new Error("Ticket not found");
    if (!opts.fromStaff && cur.status === "closed") throw new Error("This conversation is closed. Start a new request instead.");
    await trx.insertInto("supportMessages").values({ ticketId: cur.id, authorId: opts.author.id, body: opts.body, fromStaff: opts.fromStaff, internal }).execute();
    if (internal) {
      if (opts.status && opts.status !== cur.status) {
        const now = new Date();
        await trx.updateTable("supportTickets").set({ status: opts.status, updatedAt: now, solvedAt: opts.status === "solved" || opts.status === "closed" ? now : null }).where("id", "=", cur.id).execute();
        await queueTicket(trx, cur.id);
      }
      return cur;
    }
    // Staff replies wait on the customer; a customer reply puts it back with us (staying "in progress" if it was).
    const status: TicketStatus = opts.status ?? (opts.fromStaff ? "pending" : cur.status === "in_progress" ? "in_progress" : "open");
    const now = new Date();
    await trx
      .updateTable("supportTickets")
      .set({
        lastMessage: preview(opts.body),
        updatedAt: now,
        status,
        solvedAt: status === "solved" || status === "closed" ? now : null,
        ...(opts.fromStaff && !cur.firstResponseAt ? { firstResponseAt: now } : {}),
        // Whoever answers first takes the ticket.
        ...(opts.fromStaff && !cur.assignedTo ? { assignedTo: opts.author.id } : {}),
      })
      .where("id", "=", cur.id)
      .execute();
    await queueTicket(trx, cur.id);
    return cur;
  });
  if (internal) return;
  if (opts.fromStaff) {
    const who = t.createdBy ? await db.selectFrom("users").select("email").where("id", "=", t.createdBy).executeTakeFirst() : undefined;
    await mail(
      who?.email,
      `Re: ${t.subject} [#${t.id}]`,
      "Local Service Pro support replied",
      [esc(opts.body).replace(/\n/g, "<br>")],
      opts.origin ? `${linkBase(opts.origin)}/support?t=${t.id}` : undefined,
    );
  } else {
    await mail(
      supportInbox(),
      `Re: ${t.subject} [#${t.id}]`,
      `Customer replied on #${t.id}`,
      [`<b>${esc(opts.author.displayName)}</b> (${esc(opts.author.email)}) wrote:`, esc(opts.body).replace(/\n/g, "<br>")],
      opts.origin ? `${linkBase(opts.origin)}/admin?tab=support&t=${t.id}` : undefined,
    );
  }
}

/** Status / priority / assignee change (staff any; the business may only mark solved or reopen). */
export async function updateTicket(
  ticketId: number,
  patch: { status?: TicketStatus; priority?: TicketPriority; assignedTo?: number | null },
  businessId?: number,
) {
  await db.transaction().execute(async (trx) => {
    let q = trx.selectFrom("supportTickets").select(["id", "status", "priority", "assignedTo"]).where("id", "=", ticketId);
    if (businessId) q = q.where("businessId", "=", businessId);
    const cur = await q.executeTakeFirst();
    if (!cur) throw new Error("Ticket not found");
    const status = patch.status ?? (cur.status as TicketStatus);
    const priority = patch.priority ?? cur.priority;
    const assignedTo = patch.assignedTo === undefined ? cur.assignedTo : patch.assignedTo;
    if (status === cur.status && priority === cur.priority && assignedTo === cur.assignedTo) return;
    if (assignedTo !== cur.assignedTo && assignedTo !== null) {
      const staff = await trx.selectFrom("users").select("id").where("id", "=", assignedTo).where("role", "=", "admin").executeTakeFirst();
      if (!staff) throw new Error("Tickets can only be assigned to Local Service Pro staff");
    }
    const now = new Date();
    const visible = status !== cur.status || priority !== cur.priority;
    await trx
      .updateTable("supportTickets")
      .set({
        status,
        priority,
        assignedTo,
        ...(visible ? { updatedAt: now } : {}),
        ...(status !== cur.status ? { solvedAt: status === "solved" || status === "closed" ? now : null } : {}),
      })
      .where("id", "=", cur.id)
      .execute();
    if (visible) await queueTicket(trx, cur.id);
  });
}
