import superjson from "superjson";
import { disconnectGcal } from "../../helpers/googleCalendar";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./disconnect_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    await disconnectGcal(ctx.businessId);
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
