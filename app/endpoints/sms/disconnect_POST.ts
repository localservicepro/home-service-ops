import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { disconnectSms } from "../../helpers/sms";
import type { OutputType } from "./disconnect_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    await disconnectSms(ctx.businessId);
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
