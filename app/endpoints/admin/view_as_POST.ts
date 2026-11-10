import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { schema, type OutputType } from "./view_as_POST.schema";

export async function handle(request: Request) {
  try {
    const staff = await requirePlatformAdmin(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const biz = await db.selectFrom("businesses").select(["id", "name"]).where("id", "=", input.businessId).executeTakeFirst();
    if (!biz) throw new Error("Customer not found");
    const expiresAt = new Date(Date.now() + input.minutes * 60_000);
    const out = await db.transaction().execute(async (trx) => {
      // One open view per staff member at a time.
      await trx.updateTable("supportSessions").set({ endedAt: new Date() }).where("staffId", "=", staff.id).where("endedAt", "is", null).execute();
      const s = await trx
        .insertInto("supportSessions")
        .values({ staffId: staff.id, businessId: biz.id, reason: input.reason, allowChanges: input.allowChanges, expiresAt })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("customerNotes")
        .values({ businessId: biz.id, authorId: staff.id, body: `Opened the account in support view (${input.allowChanges ? "changes allowed" : "read-only"}): ${input.reason}` })
        .execute();
      return s;
    });
    return new Response(superjson.stringify({ sessionId: out.id, businessId: biz.id, businessName: biz.name, allowChanges: input.allowChanges, expiresAt } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
