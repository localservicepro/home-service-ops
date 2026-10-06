import superjson from "superjson";
import { listPipelines } from "../../helpers/lcSync";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./pipelines_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const out: OutputType = { pipelines: await listPipelines(ctx.businessId) };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
