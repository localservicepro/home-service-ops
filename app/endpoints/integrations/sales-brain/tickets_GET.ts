import { jsonReply, refuseUnlessSalesBrain, serveRead } from "../../../helpers/salesBrainAuth";
import { ticket, ticketWithMessages, wantsDemo } from "../../../helpers/salesBrainCustomers";
import { getTicket, listTickets } from "../../../helpers/support";
import { db } from "../../../helpers/db";
import { TICKET_STATUSES } from "../../../helpers/supportShared";

// Read-only, for Sales Brain's assistant: support tickets.
//  ?status=open,in_progress,pending (any of open | in_progress | pending | solved | closed | active)
//  ?account_id=N  one customer's tickets
//  ?ticket_id=N   one ticket with its whole conversation, internal staff notes marked
//  ?include_demo=1 to include demo customers
export async function handle(request: Request) {
  const refused = refuseUnlessSalesBrain(request);
  if (refused) return refused;
  const url = new URL(request.url);
  const includeDemo = wantsDemo(url);
  const ticketId = (url.searchParams.get("ticket_id") ?? "").trim();
  const accountId = (url.searchParams.get("account_id") ?? "").trim();
  if (ticketId && !/^\d+$/.test(ticketId)) return jsonReply(400, { error: "ticket_id must be a ticket number" });
  if (accountId && !/^\d+$/.test(accountId)) return jsonReply(400, { error: "account_id must be this app's account id" });
  const wanted = (url.searchParams.get("status") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const statuses = [...new Set(wanted.flatMap((s) => (s === "active" ? ["open", "in_progress", "pending"] : [s])))];
  const bad = statuses.find((s) => !(TICKET_STATUSES as readonly string[]).includes(s));
  if (bad) return jsonReply(400, { error: `Unknown status "${bad}". Use ${TICKET_STATUSES.join(", ")} or active.` });

  return serveRead("tickets", async () => {
    const now = Date.now();
    const demoIds = includeDemo ? new Set<number>() : new Set((await db.selectFrom("businesses").select("id").where("isDemo", "=", true).execute()).map((b) => b.id));
    if (ticketId) {
      const t = await getTicket(Number(ticketId)).catch((e: Error) => (e.message === "Ticket not found" ? null : Promise.reject(e)));
      if (!t || demoIds.has(t.businessId)) return jsonReply(404, { error: "No ticket with that ticket_id" });
      return jsonReply(200, { generated_at: new Date(now).toISOString(), ticket: ticketWithMessages(t, now) });
    }
    const list = (await listTickets({ status: statuses, businessId: accountId ? Number(accountId) : undefined, limit: 500 })).filter((t) => !demoIds.has(t.businessId));
    return jsonReply(200, { generated_at: new Date(now).toISOString(), demo_included: includeDemo, count: list.length, tickets: list.map((t) => ticket(t, now)) });
  });
}
