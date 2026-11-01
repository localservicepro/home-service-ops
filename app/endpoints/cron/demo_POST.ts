import superjson from "superjson";
import { rejectUnlessCron } from "../../helpers/cronAuth";
import { clearDemo, loadDemo } from "../../helpers/demoData";
import { customerDetail, listCustomers, overview, supportOverview } from "../../helpers/adminData";
import { getTicket, listStaff, listTickets } from "../../helpers/support";
import { db } from "../../helpers/db";
import type { OutputType } from "./demo_POST.schema";

export async function handle(request: Request) {
  const refused = await rejectUnlessCron(request);
  if (refused) return refused;
  const text = await request.text();
  const action = (text ? JSON.parse(text).action : "load") as string;
  if (action === "snapshot") {
    // TEMPORARY: what the admin screens receive, for a screenshot check. Removed after.
    const demo = await db.selectFrom("businesses").select("id").where("isDemo", "=", true).orderBy("id").execute();
    const tickets = await listTickets({ status: ["open", "pending"] });
    const parts = {
      overview: await overview(),
      support: await supportOverview(),
      customers: { customers: await listCustomers() },
      customer: demo[0] ? await customerDetail(demo[0].id) : null,
      suspended: demo[23] ? await customerDetail(demo[23].id) : null,
      tickets: { tickets, counts: {}, staff: await listStaff(), meId: 1 },
      ticket: tickets[0] ? await getTicket(tickets[0].id) : null,
    };
    return new Response(JSON.stringify(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, superjson.stringify(v)]))));
  }
  const out: OutputType = action === "clear" ? { ok: true, removed: await clearDemo() } : { ok: true, ...(await loadDemo()) };
  return new Response(superjson.stringify(out));
}
