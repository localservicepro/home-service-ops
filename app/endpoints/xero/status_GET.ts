import superjson from "superjson";
import { xeroStatus } from "../../helpers/xero";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const withAccounts = new URL(request.url).searchParams.get("accounts") === "1";
    const out: OutputType = await xeroStatus(ctx.businessId, withAccounts);
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
