import superjson from "superjson";
import { db } from "../../helpers/db";
import { connectGbp, disconnectGbp, searchPlaces, sendReviewRequest, sendReviewTest } from "../../helpers/reviews";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { connectGbpLocation, createGbpPost, deleteReviewReply, listGbpLocations, replyToReview, signOutGbpGoogle, syncGbpReviews } from "../../helpers/gbpGoogle";
import { schema, type OutputType } from "./manage_POST.schema";

// Office only: connect the Google Business Profile (search, or sign in with Google and pick the
// listing), send tests / manual requests, client opt-out; signed in: reply to reviews and post.
export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ["owner", "admin"], { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    let out: OutputType = { ok: true };
    switch (input.action) {
      case "search":
        out = { ok: true, results: await searchPlaces(input.query) };
        break;
      case "connect":
        await connectGbp(ctx.businessId, input.placeId);
        break;
      case "disconnect":
        await disconnectGbp(ctx.businessId);
        break;
      case "test": {
        if (!ctx.user.email) throw new Error("Your login has no email address.");
        await sendReviewTest(ctx.businessId, ctx.user.email);
        out = { ok: true, message: `Test sent to ${ctx.user.email}` };
        break;
      }
      case "send": {
        const r = await sendReviewRequest(ctx.businessId, input.jobId, { force: true });
        if (r.status !== "sent") throw new Error(r.reason ?? "Couldn't send the review request.");
        out = { ok: true, message: "Review request sent" };
        break;
      }
      case "optout": {
        const r = await db
          .updateTable("clients")
          .set({ reviewOptOut: input.optOut })
          .where("id", "=", input.clientId)
          .where("businessId", "=", ctx.businessId)
          .executeTakeFirst();
        if (!Number(r.numUpdatedRows)) throw new Error("Client not found");
        break;
      }
      case "locations":
        out = { ok: true, locations: await listGbpLocations(ctx.businessId) };
        break;
      case "pick": {
        const loc = await connectGbpLocation(ctx.businessId, input.locationName);
        out = { ok: true, message: `${loc.title} connected` };
        break;
      }
      case "sync": {
        const r = await syncGbpReviews(ctx.businessId);
        out = { ok: true, message: r.added ? `${r.added} new review${r.added === 1 ? "" : "s"}` : "Reviews are up to date" };
        break;
      }
      case "reply":
        await replyToReview(ctx.businessId, input.reviewId, input.comment);
        out = { ok: true, message: "Reply posted on Google" };
        break;
      case "deleteReply":
        await deleteReviewReply(ctx.businessId, input.reviewId);
        out = { ok: true, message: "Reply removed" };
        break;
      case "post":
        await createGbpPost(ctx.businessId, { summary: input.summary, action: input.button ?? null, url: input.url ?? null });
        out = { ok: true, message: "Update posted to your Business Profile" };
        break;
      case "signout":
        await signOutGbpGoogle(ctx.businessId);
        out = { ok: true, message: "Signed out of Google" };
        break;
    }
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
