import superjson from "superjson";
import { errorResponse } from "../../helpers/tenant";
import { requirePlatformAdmin } from "../../helpers/support";
import { processOutbox, resendProblems, runBackfill, testConnection } from "../../helpers/salesBrain";
import { schema, OutputType } from "./salesbrain_POST.schema";

export async function handle(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const input = schema.parse(superjson.parse(await request.text()));
    let out: OutputType;
    switch (input.action) {
      case "test": {
        const r = await testConnection();
        out = { ok: r.ok, message: `${r.message}${r.status !== null ? ` (${r.ms} ms)` : ""}` };
        break;
      }
      case "send": {
        const r = await processOutbox();
        out = "skipped" in r && r.skipped ? { ok: false, message: r.skipped } : { ok: r.failed === 0, message: `Sent ${r.sent}${r.failed ? `, ${r.failed} failed (see below)` : ""}.` };
        break;
      }
      case "resend": {
        const n = await resendProblems();
        out = { ok: true, message: n ? `${n} event${n === 1 ? "" : "s"} back in the queue. They go out within a minute.` : "Nothing was held or rejected." };
        break;
      }
      case "backfill": {
        const r = await runBackfill();
        out = {
          ok: r.errors.length === 0,
          message: `Queued ${r.accounts.queued} of ${r.accounts.total} accounts, ${r.payments.queued} of ${r.payments.total} payments and ${r.tickets.queued} of ${r.tickets.total} tickets (the rest were already sent as they are now).${r.errors.length ? ` Problems: ${r.errors.slice(0, 3).join("; ")}` : ""}`,
        };
        break;
      }
    }
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
