import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { db } from "../../helpers/db";
import { toE164 } from "../../helpers/sms";
import { schema, type OutputType } from "./settings_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if (input.prefs.ownerAlerts && !toE164(input.prefs.ownerPhone)) throw new Error("Enter the mobile number to send your alerts to.");
    const r = await db
      .updateTable("smsConnection")
      .set({ workspaceId: input.workspaceId == null ? null : String(input.workspaceId), workspaceName: input.workspaceName, prefs: input.prefs })
      .where("businessId", "=", ctx.businessId)
      .executeTakeFirst();
    if (!Number(r.numUpdatedRows)) throw new Error("myCRMSIM isn't connected.");
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
