import superjson from "superjson";
import { db } from "../../helpers/db";
import { syncAllToCalendar } from "../../helpers/calendarSync";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./sync_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const conn = await db.selectFrom("gcalConnection").select("businessId").where("businessId", "=", ctx.businessId).executeTakeFirst();
    if (!conn) throw new Error("Google Calendar isn't connected.");
    const r = await syncAllToCalendar(ctx.businessId);
    const out: OutputType = { synced: r.synced, failed: r.failed };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
