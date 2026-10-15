import superjson from "superjson";
import { checkAnyPayment } from "../../helpers/cardPay";
import { ANY_MEMBER, assertJobAccess, errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./check_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    await assertJobAccess(ctx, input.jobId);
    const out: OutputType = await checkAnyPayment(ctx.businessId, input.jobId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
