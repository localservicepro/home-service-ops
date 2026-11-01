import { db } from "./db";
import { env } from "./serverEnv";
import { esc, layout, sendAppEmail, EmailNotConfiguredError, linkBase } from "./mailer";
import { queueTicket } from "./salesBrain";
import { ForbiddenError } from "./tenant";
import { getServerUserSession } from "./getServerUserSession";
import type { TicketDetail, TicketPriority, TicketStatus, TicketSummary } from "./supportShared";

// Server-only. Support tickets: businesses raise them in Settings → Help & support; Local
// Service Pro staff (users.role = 'admin') answer in /admin. Every change queues a
// ticket.upserted event for Sales Brain in the same transaction.

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

export async function listTickets(opts: { businessId?: number; status?: string[] }): Promise<TicketSummary[]> {
  let q = db
    .selectFrom("supportTickets as t")
    .innerJoin("businesses as b", "b.id", "t.businessId")
    .select(["t.id", "t.subject", "t.status", "t.priority", "t.category", "t.lastMessage", "t.openedAt", "t.updatedAt", "t.solvedAt", "t.businessId", "b.name as businessName"])
    .orderBy("t.updatedAt", "desc")
    .limit(200);
  if (opts.businessId) q = q.where("t.businessId", "=", opts.businessId);
  if (opts.status?.length) q = q.where("t.status", "in", opts.status);
  return q.execute();
}

export async function getTicket(ticketId: number, businessId?: number): Promise<TicketDetail> {
  let q = db
    .selectFrom("supportTickets as t")
    .innerJoin("businesses as b", "b.id", "t.businessId")
    .leftJoin("users as u", "u.id", "t.createdBy")
    .select([
      "t.id", "t.subject", "t.body", "t.status", "t.priority", "t.category", "t.lastMessage", "t.openedAt", "t.updatedAt", "t.solvedAt",
      "t.businessId", "b.name as businessName", "u.email as createdByEmail",
    ])
    .where("t.id", "=", ticketId);
  if (businessId) q = q.where("t.businessId", "=", businessId);
  const t = await q.executeTakeFirst();
  if (!t) throw new Error("Ticket not found");
  const messages = await db
    .selectFrom("supportMessages as m")
    .leftJoin("users as u", "u.id", "m.authorId")
    .select(["m.id", "m.body", "m.fromStaff", "m.createdAt", "u.displayName"])
    .where("m.ticketId", "=", ticketId)
    .orderBy("m.createdAt")
    .execute();
  return {
    ...t,
    createdByEmail: t.createdByEmail ?? null,
    messages: messages.map((m) => ({ id: m.id, body: m.body, fromStaff: m.fromStaff, createdAt: m.createdAt, authorName: m.fromStaff ? "Local Service Pro support" : m.displayName || "You" })),
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
    origin ? `${linkBase(origin)}/admin?t=${id}` : undefined,
  );
  return id;
}

/** A reply from the business (reopens a solved ticket) or from staff (waits on the customer unless a status is given). */
export async function addMessage(opts: {
  ticketId: number;
  author: { id: number; displayName: string; email: string };
  body: string;
  fromStaff: boolean;
  status?: TicketStatus;
  businessId?: number;
  origin?: string;
}) {
  const t = await db.transaction().execute(async (trx) => {
    let q = trx.selectFrom("supportTickets").select(["id", "status", "subject", "businessId", "createdBy"]).where("id", "=", opts.ticketId);
    if (opts.businessId) q = q.where("businessId", "=", opts.businessId);
    const cur = await q.executeTakeFirst();
    if (!cur) throw new Error("Ticket not found");
    if (!opts.fromStaff && cur.status === "closed") throw new Error("This conversation is closed. Start a new request instead.");
    const status: TicketStatus = opts.status ?? (opts.fromStaff ? "pending" : "open");
    const now = new Date();
    await trx.insertInto("supportMessages").values({ ticketId: cur.id, authorId: opts.author.id, body: opts.body, fromStaff: opts.fromStaff }).execute();
    await trx
      .updateTable("supportTickets")
      .set({ lastMessage: preview(opts.body), updatedAt: now, status, solvedAt: status === "solved" || status === "closed" ? now : null })
      .where("id", "=", cur.id)
      .execute();
    await queueTicket(trx, cur.id);
    return cur;
  });
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
      opts.origin ? `${linkBase(opts.origin)}/admin?t=${t.id}` : undefined,
    );
  }
}

/** Status / priority change (staff any; the business may only mark solved or reopen). */
export async function updateTicket(ticketId: number, patch: { status?: TicketStatus; priority?: TicketPriority }, businessId?: number) {
  await db.transaction().execute(async (trx) => {
    let q = trx.selectFrom("supportTickets").select(["id", "status", "priority"]).where("id", "=", ticketId);
    if (businessId) q = q.where("businessId", "=", businessId);
    const cur = await q.executeTakeFirst();
    if (!cur) throw new Error("Ticket not found");
    const status = patch.status ?? (cur.status as TicketStatus);
    const priority = patch.priority ?? cur.priority;
    if (status === cur.status && priority === cur.priority) return;
    const now = new Date();
    await trx
      .updateTable("supportTickets")
      .set({
        status,
        priority,
        updatedAt: now,
        ...(status !== cur.status ? { solvedAt: status === "solved" || status === "closed" ? now : null } : {}),
      })
      .where("id", "=", cur.id)
      .execute();
    await queueTicket(trx, cur.id);
  });
}
