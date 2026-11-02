import superjson from "superjson";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { errorResponse } from "../../helpers/tenant";
import { schema, OutputType } from "./unregister_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const input = schema.parse(superjson.parse(await request.text()));
    await db.deleteFrom("pushDevices").where("token", "=", input.token).where("userId", "=", user.id).execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
