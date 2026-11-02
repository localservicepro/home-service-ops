import superjson from "superjson";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { errorResponse } from "../../helpers/tenant";
import { schema, OutputType } from "./prefs_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const input = schema.parse(superjson.parse(await request.text()));
    await db.updateTable("users").set({ pushPrefs: input, updatedAt: new Date() }).where("id", "=", user.id).execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
