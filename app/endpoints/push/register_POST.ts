import superjson from "superjson";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { errorResponse } from "../../helpers/tenant";
import { schema, OutputType } from "./register_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const input = schema.parse(superjson.parse(await request.text()));
    // A phone belongs to whoever signed in on it last.
    await db
      .insertInto("pushDevices")
      .values({ userId: user.id, token: input.token, platform: input.platform })
      .onConflict((oc) => oc.column("token").doUpdateSet({ userId: user.id, platform: input.platform, lastSeenAt: new Date() }))
      .execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
