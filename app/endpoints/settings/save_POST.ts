import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { queueAccountSync } from "../../helpers/salesBrain";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const patch: typeof input & { updatedAt: Date; reviewEnabledAt?: Date } = { ...input, updatedAt: new Date() };
    // Turning review requests on starts the clock: only jobs finished from now on are asked.
    if (input.reviewRequestsEnabled) {
      const cur = await db.selectFrom("settings").select("reviewRequestsEnabled").where("businessId", "=", ctx.businessId).executeTakeFirst();
      if (!cur?.reviewRequestsEnabled) patch.reviewEnabledAt = new Date();
    }
    if (patch.reviewMessage === "") patch.reviewMessage = null;
    if (patch.reminderMessage === "") patch.reminderMessage = null;
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("settings")
        .values({ businessId: ctx.businessId, ...patch })
        .onConflict((oc) => oc.column("businessId").doUpdateSet(patch))
        .execute();
      // Keep the business record's name in step with the business details.
      const name = (input.business as { name?: string } | undefined)?.name?.trim();
      if (name) await trx.updateTable("businesses").set({ name }).where("id", "=", ctx.businessId).execute();
      // Name, owner or contact details changed: Sales Brain's copy too (only if something it shows changed).
      if (input.business || input.owner) await queueAccountSync(trx, ctx.businessId);
    });
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
