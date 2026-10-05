import superjson from "superjson";
import { syncSubscription } from "../../helpers/billing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./refresh_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    await syncSubscription(ctx.businessId);
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
