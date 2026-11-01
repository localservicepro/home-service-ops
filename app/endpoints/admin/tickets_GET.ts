import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse } from "../../helpers/tenant";
import { listTickets, requirePlatformAdmin } from "../../helpers/support";
import { schema, type OutputType } from "./tickets_GET.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const input = schema.parse({ status: new URL(request.url).searchParams.get("status") ?? undefined });
    const status = input.status === "all" ? undefined : input.status === "active" ? ["open", "pending"] : [input.status];
    const [tickets, counts] = await Promise.all([
      listTickets({ status }),
      db.selectFrom("supportTickets").select(["status", (eb) => eb.fn.countAll<string>().as("n")]).groupBy("status").execute(),
    ]);
    return new Response(superjson.stringify({ tickets, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
