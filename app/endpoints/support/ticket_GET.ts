import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { getTicket } from "../../helpers/support";
import { schema, type OutputType } from "./ticket_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true, allowSuspended: true });
    const input = schema.parse({ id: Number(new URL(request.url).searchParams.get("id")) });
    return new Response(superjson.stringify((({ assignedTo: _a, assigneeName: _n, ...t }) => t)(await getTicket(input.id, ctx.businessId)) satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
