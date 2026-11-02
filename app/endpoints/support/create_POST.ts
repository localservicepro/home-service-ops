import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { isValidOrigin } from "../../helpers/mailer";
import { createTicket } from "../../helpers/support";
import { schema, OutputType } from "./create_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true, allowSuspended: true });
    const input = schema.parse(superjson.parse(await request.text()));
    const id = await createTicket(ctx, input, input.origin && isValidOrigin(input.origin) ? input.origin : undefined);
    return new Response(superjson.stringify({ id } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
