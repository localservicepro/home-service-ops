import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../../helpers/db";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { syncJobsToCalendar } from "../../helpers/calendarSync";
import { pushToLc } from "../../helpers/lcSync";
import { pushJobAssigned } from "../../helpers/push";
import { parseTime } from "../../helpers/routePlanner";
import { schema, type OutputType } from "./apply_POST.schema";

// The same rules as saving a job by hand (jobs/save): a new crew member brings their pay rate, a new
// time clears the reminder so the customer is reminded of the right time, and the calendar,
// LeadConnector and the crew member's phone hear about it.
export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    const biz = ctx.businessId;
    for (const c of input.changes) if (c.time && parseTime(c.time) === null) throw new Error(`"${c.time}" isn't a time like 9:00 AM`);

    const ids = [...new Set(input.changes.map((c) => c.jobId))];
    const newlyAssigned: number[] = [];
    let reassigned = 0;
    let retimed = 0;
    await db.transaction().execute(async (trx) => {
      const jobs = await trx
        .selectFrom("jobs")
        .select(["id", "staffId", "scheduledTime", "status"])
        .select(sql<string | null>`to_char(scheduled_date, 'YYYY-MM-DD')`.as("dateText"))
        .where("businessId", "=", biz)
        .where("id", "in", ids)
        .execute();
      const byId = new Map(jobs.map((j) => [j.id, j]));
      const staffIds = [...new Set(input.changes.map((c) => c.staffId).filter((s): s is number => s !== null))];
      const staff = staffIds.length
        ? await trx.selectFrom("staff").select(["id", "rate", "rateType"]).where("businessId", "=", biz).where("id", "in", staffIds).execute()
        : [];
      const staffById = new Map(staff.map((s) => [s.id, s]));

      for (const c of input.changes) {
        const j = byId.get(c.jobId);
        if (!j) throw new Error("A job on this route no longer exists. Refresh the map.");
        if (j.dateText !== input.date) throw new Error(`Job ${c.jobId} has moved off ${input.date}. Refresh the map.`);
        if (j.status === "Cancelled") throw new Error(`Job ${c.jobId} was cancelled. Refresh the map.`);
        if (c.staffId !== null && !staffById.has(c.staffId)) throw new Error("Crew member not found");
        const values: Record<string, unknown> = {};
        if (c.staffId !== j.staffId) {
          values.staffId = c.staffId;
          const st = c.staffId !== null ? staffById.get(c.staffId)! : null;
          values.crewPay = st ? st.rate : null;
          values.crewPayType = st ? st.rateType : null;
          reassigned++;
          if (c.staffId !== null) newlyAssigned.push(c.jobId);
        }
        if (c.time !== j.scheduledTime) {
          Object.assign(values, { scheduledTime: c.time, reminderStatus: null, reminderSentAt: null, reminderSentTo: null });
          retimed++;
        }
        if (Object.keys(values).length) await trx.updateTable("jobs").set(values).where("id", "=", c.jobId).where("businessId", "=", biz).execute();
      }
    });

    if (reassigned || retimed) {
      await syncJobsToCalendar(ids);
      await pushToLc(biz, { jobIds: ids });
      for (const id of newlyAssigned) await pushJobAssigned(id);
    }
    const out: OutputType = { updated: ids.length, reassigned, retimed };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return errorResponse(error);
  }
}
