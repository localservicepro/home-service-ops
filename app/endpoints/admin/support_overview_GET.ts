import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { supportOverview } from "../../helpers/adminData";
import type { OutputType } from "./support_overview_GET.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return new Response(superjson.stringify((await supportOverview()) satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
