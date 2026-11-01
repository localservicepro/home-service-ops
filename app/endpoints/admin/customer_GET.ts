import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { customerDetail } from "../../helpers/adminData";
import { schema, type OutputType } from "./customer_GET.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const { id } = schema.parse({ id: Number(new URL(request.url).searchParams.get("id")) });
    return new Response(superjson.stringify((await customerDetail(id)) satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
