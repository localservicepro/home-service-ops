import superjson from "superjson";
import { db } from "../../helpers/db";
import { hasStripeWebhook, isStripeConfigured } from "../../helpers/stripeConnect";
import { ANY_MEMBER, errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const c = await db.selectFrom("stripeConnection").selectAll().where("businessId", "=", ctx.businessId).executeTakeFirst();
    const out: OutputType = {
      configured: isStripeConfigured(),
      webhook: hasStripeWebhook(),
      connected: !!c,
      accountId: c?.accountId ?? null,
      accountName: c?.accountName || null,
      livemode: c?.livemode ?? false,
      connectedAt: c?.connectedAt ?? null,
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
