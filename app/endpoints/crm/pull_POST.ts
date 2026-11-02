import superjson from "superjson";
import { pullLeads } from "../../helpers/lcSync";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./pull_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    const r = await pullLeads(ctx.businessId, { force: !!input.force });
    const out: OutputType = { imported: r.imported, skipped: r.skipped, ...("error" in r && r.error ? { error: r.error } : {}) };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
