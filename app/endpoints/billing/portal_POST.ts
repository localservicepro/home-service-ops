import superjson from "superjson";
import { createPortal } from "../../helpers/billing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./portal_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner"], { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    const out: OutputType = await createPortal(ctx.businessId, input.origin);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
