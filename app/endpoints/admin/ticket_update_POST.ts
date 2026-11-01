import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin, updateTicket } from "../../helpers/support";
import { schema, OutputType } from "./ticket_update_POST.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const input = schema.parse(superjson.parse(await request.text()));
    await updateTicket(input.ticketId, { status: input.status, priority: input.priority, assignedTo: input.assignedTo });
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
