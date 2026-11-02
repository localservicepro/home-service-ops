import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const biz = ctx.businessId;
    const input = schema.parse(superjson.parse(await request.text()));
    const id = await db.transaction().execute(async (trx) => {
      if (input.kind === "addon") {
        const values = { name: input.name, price: input.price, serviceIds: Array.from(new Set(input.serviceIds)) };
        const row = input.id
          ? await trx.updateTable("addons").set(values).where("id", "=", input.id).where("businessId", "=", biz).returning("id").executeTakeFirst()
          : await trx.insertInto("addons").values({ ...values, businessId: biz }).returning("id").executeTakeFirst();
        if (!row) throw new Error("Add-on not found");
        return row.id;
      }

      const values = { name: input.name, price: input.price, freq: input.freq, active: input.active };
      const row = input.id
        ? await trx.updateTable("services").set(values).where("id", "=", input.id).where("businessId", "=", biz).returning("id").executeTakeFirst()
        : await trx.insertInto("services").values({ ...values, businessId: biz }).returning("id").executeTakeFirst();
      if (!row) throw new Error("Service not found");

      if (input.addonIds) {
        const want = new Set(input.addonIds);
        const addons = await trx.selectFrom("addons").select(["id", "serviceIds"]).where("businessId", "=", biz).execute();
        for (const a of addons) {
          const ids = (Array.isArray(a.serviceIds) ? a.serviceIds : []).map(Number);
          const has = ids.includes(row.id);
          if (has === want.has(a.id)) continue;
          const next = want.has(a.id) ? [...ids, row.id] : ids.filter((x) => x !== row.id);
          await trx.updateTable("addons").set({ serviceIds: next }).where("id", "=", a.id).execute();
        }
      }
      return row.id;
    });
    return new Response(superjson.stringify({ id } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
