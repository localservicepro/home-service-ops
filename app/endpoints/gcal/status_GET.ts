import superjson from "superjson";
import { db } from "../../helpers/db";
import { isGcalConfigured } from "../../helpers/googleCalendar";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const conn = await db
      .selectFrom("gcalConnection")
      .select(["email", "connectedAt", "timeZone", "lastSyncedAt", "lastSyncError"])
      .where("businessId", "=", ctx.businessId)
      .executeTakeFirst();
    const linked = await db
      .selectFrom("jobs")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("businessId", "=", ctx.businessId)
      .where("gcalEventId", "is not", null)
      .executeTakeFirstOrThrow();
    const out: OutputType = {
      configured: isGcalConfigured(),
      connected: !!conn,
      email: conn?.email ?? null,
      connectedAt: conn?.connectedAt ?? null,
      timeZone: conn?.timeZone ?? null,
      lastSyncedAt: conn?.lastSyncedAt ?? null,
      lastSyncError: conn?.lastSyncError ?? null,
      linkedJobs: Number(linked.n),
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
