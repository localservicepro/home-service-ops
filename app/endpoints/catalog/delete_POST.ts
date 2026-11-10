import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./delete_POST.schema";

// Existing quote/job line items keep their own name + price, so deleting from the
// catalog never changes past invoices.
export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const biz = ctx.businessId;
    const input = schema.parse(superjson.parse(await request.text()));
    await db.transaction().execute(async (trx) => {
      if (input.kind === "addon") {
        await trx.deleteFrom("addons").where("id", "=", input.id).where("businessId", "=", biz).execute();
        return;
      }
      const res = await trx.deleteFrom("services").where("id", "=", input.id).where("businessId", "=", biz).executeTakeFirst();
      if (!Number(res.numDeletedRows)) return;
      const addons = await trx.selectFrom("addons").select(["id", "serviceIds"]).where("businessId", "=", biz).execute();
      for (const a of addons) {
        const ids = (Array.isArray(a.serviceIds) ? a.serviceIds : []).map(Number);
        if (ids.includes(input.id)) {
          await trx.updateTable("addons").set({ serviceIds: ids.filter((x) => x !== input.id) }).where("id", "=", a.id).execute();
        }
      }
    });
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
