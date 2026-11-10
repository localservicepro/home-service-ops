import superjson from "superjson";
import { startGbpAuth } from "../../helpers/gbpGoogle";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./authorize_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner", "admin"], { allowExpired: true });
    const out: OutputType = await startGbpAuth(ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
