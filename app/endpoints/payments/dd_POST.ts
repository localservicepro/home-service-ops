import superjson from "superjson";
import { ddStateFor, startJobDirectDebit, syncGcJob } from "../../helpers/goCardless";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./dd_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner", "admin"], { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType =
      input.action === "start"
        ? await startJobDirectDebit(ctx.businessId, input.jobId)
        : input.action === "sync"
          ? await syncGcJob(ctx.businessId, input.jobId)
          : await ddStateFor(ctx.businessId, input.jobId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
