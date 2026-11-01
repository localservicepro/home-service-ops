import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { isValidOrigin } from "../../helpers/mailer";
import { createStaffTicket, requirePlatformAdmin } from "../../helpers/support";
import { schema, type OutputType } from "./ticket_create_POST.schema";

export async function handle(request: Request) {
  try {
    const user = await requirePlatformAdmin(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const id = await createStaffTicket(user, input, input.origin && isValidOrigin(input.origin) ? input.origin : undefined);
    return new Response(superjson.stringify({ id } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
