import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { listTickets } from "../../helpers/support";
import type { OutputType } from "./list_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    return new Response(superjson.stringify({ tickets: (await listTickets({ businessId: ctx.businessId })).map(({ assignedTo: _a, assigneeName: _n, ...t }) => t) } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
