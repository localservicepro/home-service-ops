import superjson from "superjson";
import { cardProviderFor, createCardLink } from "../../helpers/cardPay";
import { ANY_MEMBER, assertJobAccess, errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./link_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    await assertJobAccess(ctx, input.jobId);
    const provider = await cardProviderFor(ctx.businessId);
    if (!provider) throw new Error("Connect Stripe or Square in Settings to create card payment links.");
    const r = await createCardLink(ctx.businessId, input.jobId, provider);
    const out: OutputType = { ...r, provider };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
