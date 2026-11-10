import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { getTicket, requirePlatformAdmin } from "../../helpers/support";
import { schema, type OutputType } from "./ticket_GET.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const input = schema.parse({ id: Number(new URL(request.url).searchParams.get("id")) });
    return new Response(superjson.stringify((await getTicket(input.id)) satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
