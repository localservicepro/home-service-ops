import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const addresses = Array.from(new Set(input.addresses));
    const values = { name: input.name, phone: input.phone, email: input.email, addresses };
    const row = input.id
      ? await db
          .updateTable("clients")
          .set(values)
          .where("id", "=", input.id)
          .where("businessId", "=", ctx.businessId)
          .returning("id")
          .executeTakeFirst()
      : await db.insertInto("clients").values({ ...values, businessId: ctx.businessId }).returning("id").executeTakeFirst();
    if (!row) throw new Error("Client not found");
    return new Response(superjson.stringify({ id: row.id } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
