import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./delete_POST.schema";

// Removes the client record. Their jobs and quotes keep the customer name/address
// (client_id is set null by the foreign key) so job history is never lost.
export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const res = await db.deleteFrom("clients").where("id", "=", input.id).where("businessId", "=", ctx.businessId).executeTakeFirst();
    if (!Number(res.numDeletedRows)) throw new Error("Client not found");
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
