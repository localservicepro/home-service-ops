import superjson from "superjson";
import { db } from "../../helpers/db";
import { DEFAULT_REVIEW_MESSAGE, gbpStatus } from "../../helpers/reviews";
import { ANY_MEMBER, errorResponse, requireMember } from "../../helpers/tenant";
import type { OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const [st, s] = await Promise.all([
      gbpStatus(ctx.businessId),
      db
        .selectFrom("settings")
        .select(["reviewRequestsEnabled", "reviewTrigger", "reviewDelayMinutes", "reviewMessage"])
        .where("businessId", "=", ctx.businessId)
        .executeTakeFirst(),
    ]);
    const out: OutputType = {
      ...st,
      review: {
        enabled: !!s?.reviewRequestsEnabled,
        trigger: s?.reviewTrigger === "done" ? "done" : "paid",
        delayMinutes: s?.reviewDelayMinutes ?? 0,
        message: s?.reviewMessage ?? "",
        defaultMessage: DEFAULT_REVIEW_MESSAGE,
      },
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
