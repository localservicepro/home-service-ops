import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { updateTicket } from "../../helpers/support";
import { schema, OutputType } from "./status_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true, allowSuspended: true });
    const input = schema.parse(superjson.parse(await request.text()));
    await updateTicket(input.ticketId, { status: input.status }, ctx.businessId);
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
