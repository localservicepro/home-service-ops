import superjson from "superjson";
import { getBilling } from "../../helpers/billing";
import { isStripeConfigured } from "../../helpers/stripeConnect";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const b = await getBilling(ctx.businessId);
    const out: OutputType = { ...b, canManage: ctx.role === "owner", stripeReady: isStripeConfigured() };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
