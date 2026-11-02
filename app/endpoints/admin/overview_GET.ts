import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { overview } from "../../helpers/adminData";
import type { OutputType } from "./overview_GET.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return new Response(superjson.stringify((await overview()) satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
