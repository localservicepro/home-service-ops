import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { schema, type OutputType } from "./view_as_end_POST.schema";

export async function handle(request: Request) {
  try {
    const staff = await requirePlatformAdmin(request);
    const { sessionId } = schema.parse(superjson.parse(await request.text()));
    await db.updateTable("supportSessions").set({ endedAt: new Date() }).where("id", "=", sessionId).where("staffId", "=", staff.id).where("endedAt", "is", null).execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
