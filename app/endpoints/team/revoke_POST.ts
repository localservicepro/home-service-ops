import superjson from "superjson";
import { db } from "../../helpers/db";
import { ForbiddenError, errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./revoke_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    if (input.inviteId) {
      await db.deleteFrom("invites").where("id", "=", input.inviteId).where("businessId", "=", ctx.businessId).where("acceptedAt", "is", null).execute();
      return new Response(superjson.stringify({ ok: true } satisfies OutputType));
    }
    const m = await db
      .selectFrom("memberships")
      .select(["id", "userId", "role"])
      .where("id", "=", input.membershipId!)
      .where("businessId", "=", ctx.businessId)
      .executeTakeFirst();
    if (!m) throw new Error("Team member not found");
    if (m.userId === ctx.user.id) throw new ForbiddenError("You can't remove yourself.");
    if (m.role === "owner") throw new ForbiddenError("The owner can't be removed.");
    if (m.role === "admin" && ctx.role !== "owner") throw new ForbiddenError("Only the owner can remove office admins.");
    // Every API call checks membership, so removing it cuts off access straight away.
    await db.deleteFrom("memberships").where("id", "=", m.id).execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
