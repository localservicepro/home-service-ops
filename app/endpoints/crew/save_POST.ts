import superjson from "superjson";
import { db } from "../../helpers/db";
import { ANY_MEMBER, ForbiddenError, errorResponse, isOffice, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./save_POST.schema";

const PALETTE = ["#0C6FD0", "#35C6F4", "#075BAF", "#2C9E73", "#D98A1F", "#7A5AF8", "#C4453C", "#0C9BD6"];

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const input = schema.parse(superjson.parse(await request.text()));
    const biz = ctx.businessId;

    // Crew can only change their own on-duty status.
    if (!isOffice(ctx)) {
      if (!input.id || input.id !== ctx.staffId || !input.duty) throw new ForbiddenError("Crew can only update their own status.");
      await db.updateTable("staff").set({ duty: input.duty }).where("id", "=", input.id).where("businessId", "=", biz).execute();
      return new Response(superjson.stringify({ id: input.id } satisfies OutputType));
    }

    const values = {
      name: input.name,
      role: input.role,
      rateType: input.rateType,
      rate: input.rate,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.duty ? { duty: input.duty } : {}),
    };
    let id: number;
    if (input.id) {
      const row = await db.updateTable("staff").set(values).where("id", "=", input.id).where("businessId", "=", biz).returning("id").executeTakeFirst();
      if (!row) throw new Error("Crew member not found");
      id = row.id;
    } else {
      const count = await db
        .selectFrom("staff")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("businessId", "=", biz)
        .executeTakeFirstOrThrow();
      const row = await db
        .insertInto("staff")
        .values({ ...values, businessId: biz, color: PALETTE[Number(count.n) % PALETTE.length] })
        .returning("id")
        .executeTakeFirstOrThrow();
      id = row.id;
    }
    return new Response(superjson.stringify({ id } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
