import superjson from "superjson";
import { startLcAuth } from "../../helpers/leadConnector";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { assertFeature } from "../../helpers/billing";
import { schema, OutputType } from "./authorize_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    await assertFeature(ctx.businessId, "leadConnector");
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType = await startLcAuth(input.origin, ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
