import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./list_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const [members, invites] = await Promise.all([
      db
        .selectFrom("memberships")
        .innerJoin("users", "users.id", "memberships.userId")
        .select(["memberships.id", "memberships.userId", "memberships.role", "memberships.staffId", "users.displayName", "users.email"])
        .where("memberships.businessId", "=", ctx.businessId)
        .orderBy("memberships.id")
        .execute(),
      db
        .selectFrom("invites")
        .select(["id", "token", "email", "role", "staffId", "expiresAt"])
        .where("businessId", "=", ctx.businessId)
        .where("acceptedAt", "is", null)
        .where("expiresAt", ">", new Date())
        .orderBy("id", "desc")
        .execute(),
    ]);
    const out: OutputType = {
      members: members.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        name: m.displayName,
        email: m.email,
        role: m.role,
        staffId: m.staffId,
        isYou: m.userId === ctx.user.id,
      })),
      invites,
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
