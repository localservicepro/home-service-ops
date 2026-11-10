import superjson from "superjson";
import { startGcalAuth } from "../../helpers/googleCalendar";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./authorize_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType = await startGcalAuth(input.origin, ctx.businessId);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
