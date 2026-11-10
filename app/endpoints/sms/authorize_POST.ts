import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { smsInstallUrl } from "../../helpers/sms";
import type { OutputType } from "./authorize_POST.schema";

export async function handle(request: Request) {
  try {
    await requireMember(request);
    return new Response(superjson.stringify({ authorizeUrl: smsInstallUrl() } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
