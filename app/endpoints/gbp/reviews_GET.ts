import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, type OutputType } from "./reviews_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner", "admin"]);
    const input = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let q = db
      .selectFrom("gbpReviews as r")
      .leftJoin("clients as c", (j) => j.onRef("c.id", "=", "r.clientId").onRef("c.businessId", "=", "r.businessId"))
      .select(["r.reviewId", "r.stars", "r.comment", "r.reviewerName", "r.reviewerPhoto", "r.createdAt", "r.reply", "r.repliedAt", "c.id as clientId", "c.name as clientName"])
      .where("r.businessId", "=", ctx.businessId);
    if (input.filter === "unreplied") q = q.where("r.reply", "is", null);
    if (input.filter === "low") q = q.where("r.stars", "<=", 3);
    if (input.before) q = q.where("r.createdAt", "<", new Date(input.before));
    const [rows, counts, biz] = await Promise.all([
      q.orderBy("r.createdAt", "desc").limit(input.limit + 1).execute(),
      db
        .selectFrom("gbpReviews")
        .select([
          sql<number>`count(*)::int`.as("all"),
          sql<number>`count(*) filter (where reply is null)::int`.as("unreplied"),
          sql<number>`count(*) filter (where stars <= 3)::int`.as("low"),
        ])
        .where("businessId", "=", ctx.businessId)
        .executeTakeFirst(),
      db.selectFrom("gbpConnection").select("name").where("businessId", "=", ctx.businessId).executeTakeFirst(),
    ]);
    const out: OutputType = {
      reviews: rows.slice(0, input.limit).map((r) => ({
        reviewId: r.reviewId,
        stars: r.stars,
        comment: r.comment,
        reviewerName: r.reviewerName,
        reviewerPhoto: r.reviewerPhoto,
        createdAt: r.createdAt,
        reply: r.reply,
        repliedAt: r.repliedAt,
        client: r.clientId ? { id: r.clientId, name: r.clientName ?? "" } : null,
      })),
      counts: { all: counts?.all ?? 0, unreplied: counts?.unreplied ?? 0, low: counts?.low ?? 0 },
      businessName: biz?.name ?? ctx.businessName,
      more: rows.length > input.limit,
    };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
