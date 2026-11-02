import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { markRead } from "../../helpers/inbox";
import { schema, OutputType } from "./read_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    await markRead(ctx.businessId, input.phone);
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
