import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse } from "../../helpers/tenant";
import { listStaff, listTickets, requirePlatformAdmin } from "../../helpers/support";
import { schema, type OutputType } from "./tickets_GET.schema";

export async function handle(request: Request) {
  try {
    const user = await requirePlatformAdmin(request);
    const sp = new URL(request.url).searchParams;
    const input = schema.parse({ status: sp.get("status") ?? undefined, assigned: sp.get("assigned") ?? undefined, q: sp.get("q") ?? undefined });
    const status = input.status === "all" ? undefined : input.status === "active" ? ["open", "in_progress", "pending"] : [input.status];
    const assignedTo = input.assigned === "me" ? user.id : input.assigned === "none" ? ("none" as const) : undefined;
    const [tickets, counts, staff] = await Promise.all([
      listTickets({ status, assignedTo, q: input.q }),
      db.selectFrom("supportTickets").select(["status", (eb) => eb.fn.countAll<string>().as("n")]).groupBy("status").execute(),
      listStaff(),
    ]);
    const out: OutputType = { tickets, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), staff, meId: user.id };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
