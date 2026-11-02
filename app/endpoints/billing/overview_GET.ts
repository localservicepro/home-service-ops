import superjson from "superjson";
import { getBillingOverview } from "../../helpers/billing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./overview_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner"], { allowExpired: true });
    const out: OutputType = await getBillingOverview(ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
