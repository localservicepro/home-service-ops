import superjson from "superjson";
import { getMessagePrefs } from "../../helpers/messagePrefs";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./messages_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    const out: OutputType = await getMessagePrefs(ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
