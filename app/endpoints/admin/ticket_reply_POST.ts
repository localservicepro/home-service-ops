import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { isValidOrigin } from "../../helpers/mailer";
import { addMessage, requirePlatformAdmin } from "../../helpers/support";
import { schema, OutputType } from "./ticket_reply_POST.schema";

export async function handle(request: Request) {
  try {
    const user = await requirePlatformAdmin(request);
    const input = schema.parse(superjson.parse(await request.text()));
    await addMessage({
      ticketId: input.ticketId,
      author: user,
      body: input.body,
      fromStaff: true,
      status: input.status,
      origin: input.origin && isValidOrigin(input.origin) ? input.origin : undefined,
    });
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
