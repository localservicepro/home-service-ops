import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./complete_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner"], { allowExpired: true });
    await db.updateTable("businesses").set({ onboardedAt: new Date() }).where("id", "=", ctx.businessId).where("onboardedAt", "is", null).execute();
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
