import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { db } from "../../helpers/db";
import { isSmsConfigured, readPrefs } from "../../helpers/sms";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const c = await db.selectFrom("smsConnection").selectAll().where("businessId", "=", ctx.businessId).executeTakeFirst();
    const sent = await db
      .selectFrom("smsLog")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("businessId", "=", ctx.businessId)
      .where("status", "!=", "failed")
      .where("createdAt", ">", new Date(Date.now() - 30 * 86_400_000))
      .executeTakeFirstOrThrow();
    const out: OutputType = {
      configured: isSmsConfigured(),
      connected: !!c,
      installerName: c?.installerName ?? null,
      installerEmail: c?.installerEmail ?? null,
      workspaceId: c?.workspaceId ? Number(c.workspaceId) : null,
      workspaceName: c?.workspaceName ?? null,
      prefs: readPrefs(c?.prefs),
      lastSentAt: c?.lastSentAt ?? null,
      lastError: c?.lastError ?? null,
      sent30d: Number(sent.n),
      ready: !!c?.workspaceId && isSmsConfigured(),
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
