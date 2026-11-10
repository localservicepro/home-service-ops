import superjson from "superjson";
import { db } from "../../helpers/db";
import { gbpInsights, listGbpPosts } from "../../helpers/gbpGoogle";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, type OutputType } from "./profile_GET.schema";

const why = (e: unknown) => (e instanceof Error ? e.message : "Google didn't answer.");

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner", "admin"]);
    const input = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [ins, posts, c] = await Promise.all([
      gbpInsights(ctx.businessId, !!input.refresh).then((v) => ({ v, e: null }), (e) => ({ v: null, e: why(e) })),
      listGbpPosts(ctx.businessId).then((v) => ({ v, e: null }), (e) => ({ v: null, e: why(e) })),
      db.selectFrom("gbpConnection").select("website").where("businessId", "=", ctx.businessId).executeTakeFirst(),
    ]);
    const out: OutputType = { insights: ins.v, insightsError: ins.e, posts: posts.v, postsError: posts.e, website: c?.website ?? null };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
