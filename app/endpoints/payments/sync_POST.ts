import superjson from "superjson";
import { syncPendingCard } from "../../helpers/cardPay";
import { syncPendingGc } from "../../helpers/goCardless";
import { processReviewRequests } from "../../helpers/reviews";
import { syncPaidJobsToXero } from "../../helpers/xero";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./sync_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner", "admin"], { allowExpired: true });
    const [a, b] = await Promise.all([syncPendingCard(ctx.businessId).catch(() => 0), syncPendingGc(ctx.businessId).catch(() => 0)]);
    // Also sends any delayed review requests that have come due.
    await processReviewRequests(ctx.businessId).catch(() => 0);
    await syncPaidJobsToXero(ctx.businessId).catch(() => 0);
    const out: OutputType = { updated: a + b };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
