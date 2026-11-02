import superjson from "superjson";
import { createJobPaymentLink } from "../../helpers/stripeConnect";
import { ANY_MEMBER, assertJobAccess, errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./link_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    await assertJobAccess(ctx, input.jobId);
    const out: OutputType = await createJobPaymentLink(ctx.businessId, input.jobId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
