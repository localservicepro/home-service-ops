import superjson from "superjson";
import { checkXeroInvoices, disconnectXero, invoiceJobInXero, pushJobToXero, startXeroAuth, syncPaidJobsToXero, updateXeroSettings } from "../../helpers/xero";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, type OutputType } from "./connect_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner", "admin"], { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    let out: OutputType = { ok: true };
    switch (input.action) {
      case "authorize":
        out = { ok: true, ...(await startXeroAuth(ctx.businessId)) };
        break;
      case "disconnect":
        await disconnectXero(ctx.businessId);
        break;
      case "settings": {
        const { action: _a, ...patch } = input;
        await updateXeroSettings(ctx.businessId, patch);
        break;
      }
      case "push":
        out = { ok: true, status: (await pushJobToXero(ctx.businessId, input.jobId)).status };
        break;
      case "invoice":
        out = { ok: true, ...(await invoiceJobInXero(ctx.businessId, input.jobId)) };
        break;
      case "check":
        out = { ok: true, count: await checkXeroInvoices(ctx.businessId, [input.jobId]) };
        break;
      case "sync":
        out = { ok: true, count: await syncPaidJobsToXero(ctx.businessId) };
        break;
    }
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
