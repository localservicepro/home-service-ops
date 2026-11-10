import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./messages_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    await db
      .insertInto("settings")
      .values({ businessId: ctx.businessId, messagePrefs: input })
      .onConflict((oc) => oc.column("businessId").doUpdateSet({ messagePrefs: input, updatedAt: new Date() }))
      .execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
