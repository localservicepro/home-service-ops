import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { claimSmsInstall } from "../../helpers/sms";
import { schema, type OutputType } from "./claim_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType = await claimSmsInstall(input.id, ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
