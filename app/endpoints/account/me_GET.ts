import superjson from "superjson";
import { ANY_MEMBER, errorResponse, requireMember, type MemberCtx } from "../../helpers/tenant";
import { getBilling } from "../../helpers/billing";
import { db } from "../../helpers/db";
import type { OutputType } from "./me_GET.schema";

/** The signed-in member's business, role and billing summary (also returned by auth/session). */
export async function loadMe(ctx: MemberCtx): Promise<OutputType> {
  const [biz, billing] = await Promise.all([
    db.selectFrom("businesses").select(["onboardedAt", "trade"]).where("id", "=", ctx.businessId).executeTakeFirstOrThrow(),
    getBilling(ctx.businessId),
  ]);
  return {
    userId: ctx.user.id,
    email: ctx.user.email,
    displayName: ctx.user.displayName,
    businessId: ctx.businessId,
    businessName: ctx.businessName,
    role: ctx.role,
    staffId: ctx.staffId,
    billing,
    onboarded: !!biz.onboardedAt,
    trade: biz.trade,
  };
}

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    return new Response(superjson.stringify(await loadMe(ctx)));
  } catch (error) {
    return errorResponse(error);
  }
}
