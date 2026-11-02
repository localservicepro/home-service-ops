import superjson from "superjson";
import { db } from "../../helpers/db";
import { rejectUnlessCron } from "../../helpers/cronAuth";
import { processReminders } from "../../helpers/reminders";
import { processReviewRequests } from "../../helpers/reviews";
import { syncAllAccounts } from "../../helpers/salesBrain";
import type { OutputType } from "./tick_POST.schema";

// Every 15 minutes (pg_cron): job reminders, delayed review requests, and Sales Brain account
// state (changes no hook saw, like a trial running out, plus the daily usage snapshot).
export async function handle(request: Request) {
  const refused = await rejectUnlessCron(request);
  if (refused) return refused;

  const rows = await db
    .selectFrom("settings")
    .select(["businessId", "remindersEnabled", "reviewRequestsEnabled"])
    .where((eb) => eb.or([eb("remindersEnabled", "=", true), eb("reviewRequestsEnabled", "=", true)]))
    .execute();
  let reminders = 0;
  let reviews = 0;
  for (const r of rows) {
    if (r.remindersEnabled) reminders += await processReminders(r.businessId);
    if (r.reviewRequestsEnabled) reviews += await processReviewRequests(r.businessId).catch(() => 0);
  }
  const accounts = await syncAllAccounts().catch((e) => {
    console.error("[salesbrain] account sync failed", e instanceof Error ? e.message : e);
    return { queued: 0 };
  });
  const out: OutputType = { ok: true, businesses: rows.length, reminders, reviews, accountsQueued: accounts.queued };
  return new Response(superjson.stringify(out));
}
