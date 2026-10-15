import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./delete_POST.schema";

// Their jobs become unassigned (staff_id set null by the foreign key). A linked crew
// login loses its business access too, so it can't see anything any more.
export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("memberships").where("staffId", "=", input.id).where("businessId", "=", ctx.businessId).where("role", "=", "crew").execute();
      const res = await trx.deleteFrom("staff").where("id", "=", input.id).where("businessId", "=", ctx.businessId).executeTakeFirst();
      if (!Number(res.numDeletedRows)) throw new Error("Crew member not found");
    });
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
