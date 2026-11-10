import superjson from "superjson";
import { disconnectStripe } from "../../helpers/stripeConnect";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./disconnect_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner"]);
    await disconnectStripe(ctx.businessId);
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
