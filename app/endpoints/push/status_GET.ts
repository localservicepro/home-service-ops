import superjson from "superjson";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isPushConfigured, readPushPrefs } from "../../helpers/push";
import { errorResponse } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const u = await db.selectFrom("users").select("pushPrefs").where("id", "=", user.id).executeTakeFirstOrThrow();
    const n = await db.selectFrom("pushDevices").select((eb) => eb.fn.countAll<string>().as("n")).where("userId", "=", user.id).executeTakeFirstOrThrow();
    const out: OutputType = { configured: isPushConfigured(), devices: Number(n.n), prefs: readPushPrefs(u.pushPrefs) };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
