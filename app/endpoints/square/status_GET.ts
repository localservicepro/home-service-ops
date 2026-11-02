import superjson from "superjson";
import { squareStatus } from "../../helpers/squareConnect";
import { ANY_MEMBER, errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const out: OutputType = await squareStatus(ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
