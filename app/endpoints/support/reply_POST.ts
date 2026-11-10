import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { isValidOrigin } from "../../helpers/mailer";
import { addMessage } from "../../helpers/support";
import { schema, OutputType } from "./reply_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true, allowSuspended: true });
    const input = schema.parse(superjson.parse(await request.text()));
    await addMessage({
      ticketId: input.ticketId,
      businessId: ctx.businessId,
      author: ctx.user,
      body: input.body,
      fromStaff: false,
      origin: input.origin && isValidOrigin(input.origin) ? input.origin : undefined,
    });
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
