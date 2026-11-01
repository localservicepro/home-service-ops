import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { outboxSummary } from "../../helpers/salesBrain";
import type { OutputType } from "./salesbrain_GET.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return new Response(superjson.stringify((await outboxSummary()) satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
