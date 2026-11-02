import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./apply_POST.schema";

const PALETTE = ["#0C6FD0", "#35C6F4", "#075BAF", "#2C9E73", "#D98A1F", "#7A5AF8", "#C4453C", "#0C9BD6"];

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner"]);
    const biz = ctx.businessId;
    const input = schema.parse(superjson.parse(await request.text()));
    const out = await db.transaction().execute(async (trx) => {
      if (input.trade !== undefined) await trx.updateTable("businesses").set({ trade: input.trade }).where("id", "=", biz).execute();
      let services = 0;
      if (input.services?.length) {
        const existing = await trx.selectFrom("services").select("name").where("businessId", "=", biz).execute();
        const have = new Set(existing.map((s) => s.name.toLowerCase()));
        const rows = input.services.filter((s) => !have.has(s.name.toLowerCase())).map((s) => ({ ...s, businessId: biz, active: true }));
        if (rows.length) await trx.insertInto("services").values(rows).execute();
        services = rows.length;
      }
      let crew = 0;
      if (input.crew?.length) {
        const count = await trx.selectFrom("staff").select((eb) => eb.fn.countAll<string>().as("n")).where("businessId", "=", biz).executeTakeFirstOrThrow();
        const start = Number(count.n);
        await trx
          .insertInto("staff")
          .values(input.crew.map((c, i) => ({ ...c, businessId: biz, color: PALETTE[(start + i) % PALETTE.length] })))
          .execute();
        crew = input.crew.length;
      }
      return { services, crew };
    });
    return new Response(superjson.stringify(out satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
