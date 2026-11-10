import superjson from "superjson";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { InboxNotReady, listThreads } from "../../helpers/inbox";
import { isSmsConfigured } from "../../helpers/sms";
import type { OutputType } from "./threads_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    let out: OutputType;
    try {
      if (!isSmsConfigured()) throw new InboxNotReady("Texting isn't switched on for this app yet.");
      const threads = await listThreads(ctx.businessId, { fresh: new URL(request.url).searchParams.has("fresh") });
      out = { ready: true, reason: null, threads, unread: threads.reduce((n, t) => n + (t.unread ? 1 : 0), 0) };
    } catch (e) {
      if (!(e instanceof InboxNotReady)) throw e;
      out = { ready: false, reason: e.message, threads: [], unread: 0 };
    }
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
