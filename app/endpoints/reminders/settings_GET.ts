import superjson from "superjson";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { smsState } from "../../helpers/sms";
import { REMINDER_HOURS, type ReminderHours } from "../../helpers/remindersShared";
import type { OutputType } from "./settings_GET.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, undefined, { allowExpired: true });
    const [s, sms, upcoming] = await Promise.all([
      db.selectFrom("settings").select(["remindersEnabled", "reminderHours", "reminderMessage"]).where("businessId", "=", ctx.businessId).executeTakeFirst(),
      smsState(ctx.businessId),
      db
        .selectFrom("jobs")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("businessId", "=", ctx.businessId)
        .where("status", "=", "Job Scheduled")
        .where("reminderStatus", "is", null)
        .where("scheduledDate", ">=", new Date())
        .executeTakeFirstOrThrow(),
    ]);
    const hours = (REMINDER_HOURS as readonly number[]).includes(s?.reminderHours ?? 24) ? ((s?.reminderHours ?? 24) as ReminderHours) : 24;
    const out: OutputType = { enabled: !!s?.remindersEnabled, hours, message: s?.reminderMessage ?? "", smsReady: sms.ready, upcoming: Number(upcoming.n) };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
