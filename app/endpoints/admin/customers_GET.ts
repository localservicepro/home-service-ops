import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { listCustomers } from "../../helpers/adminData";
import type { OutputType } from "./customers_GET.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return new Response(superjson.stringify({ customers: await listCustomers() } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
