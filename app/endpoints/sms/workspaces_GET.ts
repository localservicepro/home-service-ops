import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { listDevices, listWorkspaces } from "../../helpers/sms";
import type { OutputType } from "./workspaces_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const [workspaces, devices] = await Promise.all([listWorkspaces(ctx.businessId), listDevices(ctx.businessId).catch(() => [])]);
    return new Response(superjson.stringify({ workspaces, devices } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
