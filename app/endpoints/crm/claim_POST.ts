import superjson from "superjson";
import { claimLcInstall } from "../../helpers/leadConnector";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { assertFeature } from "../../helpers/billing";
import { schema, OutputType } from "./claim_POST.schema";

// Links a LeadConnector install started from the marketplace to the signed-in business.
export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    await assertFeature(ctx.businessId, "leadConnector");
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType = await claimLcInstall(input.id, ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
