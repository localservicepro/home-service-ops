import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { customerAction } from "../../helpers/adminData";
import { schema, type OutputType } from "./customer_action_POST.schema";

export async function handle(request: Request) {
  try {
    const user = await requirePlatformAdmin(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const message = await customerAction(input.customerId, user, input.change);
    return new Response(superjson.stringify({ ok: true, message } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
