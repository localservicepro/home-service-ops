import superjson from "superjson";
import { ANY_MEMBER, errorResponse, requireMember } from "../../helpers/tenant";
import { getBilling } from "../../helpers/billing";
import { db } from "../../helpers/db";
import type { OutputType } from "./me_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const biz = await db.selectFrom("businesses").select(["onboardedAt", "trade"]).where("id", "=", ctx.businessId).executeTakeFirstOrThrow();
    const out: OutputType = {
      userId: ctx.user.id,
      email: ctx.user.email,
      displayName: ctx.user.displayName,
      businessId: ctx.businessId,
      businessName: ctx.businessName,
      role: ctx.role,
      staffId: ctx.staffId,
      billing: await getBilling(ctx.businessId),
      onboarded: !!biz.onboardedAt,
      trade: biz.trade,
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
