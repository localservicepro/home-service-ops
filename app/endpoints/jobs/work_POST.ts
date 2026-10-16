import superjson from "superjson";
import { db } from "../../helpers/db";
import { syncJobsToCalendar } from "../../helpers/calendarSync";
import { pushToLc } from "../../helpers/lcSync";
import { maybeSendReviews } from "../../helpers/reviews";
import { maybeSyncXero } from "../../helpers/xero";
import { ANY_MEMBER, assertJobAccess, errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./work_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER, { allowExpired: true });
    const input = schema.parse(superjson.parse(await request.text()));
    await assertJobAccess(ctx, input.id);
    await db.transaction().execute(async (trx) => {
      const job = await trx.selectFrom("jobs").selectAll().where("id", "=", input.id).where("businessId", "=", ctx.businessId).executeTakeFirst();
      if (!job) throw new Error("Job not found");
      const now = new Date();

      if (input.action === "start") {
        if (!["Job Scheduled", "In Progress"].includes(job.status)) {
          throw new Error(`Can't start a job that is ${job.status}`);
        }
        if (job.workState === "running") return;
        await trx
          .updateTable("jobs")
          .set({
            workState: "running",
            workStartedAt: now,
            status: "In Progress",
            ...(job.status !== "In Progress" ? { statusChangedAt: now } : {}),
          })
          .where("id", "=", job.id)
          .execute();
        if (job.staffId) await trx.updateTable("staff").set({ duty: "On job" }).where("id", "=", job.staffId).execute();
        return;
      }

      // finish
      if (!["Job Scheduled", "In Progress"].includes(job.status)) {
        throw new Error(`Can't finish a job that is ${job.status}`);
      }
      const add = job.workState === "running" && job.workStartedAt ? now.getTime() - new Date(job.workStartedAt).getTime() : 0;
      await trx
        .updateTable("jobs")
        .set({
          workState: "done",
          workStartedAt: null,
          workElapsedMs: Math.min(2_000_000_000, job.workElapsedMs + Math.max(0, add)),
          status: "Done",
          statusChangedAt: now,
        })
        .where("id", "=", job.id)
        .execute();
      if (job.staffId) {
        const stillRunning = await trx
          .selectFrom("jobs")
          .select("id")
          .where("staffId", "=", job.staffId)
          .where("workState", "=", "running")
          .where("id", "!=", job.id)
          .executeTakeFirst();
        if (!stillRunning) await trx.updateTable("staff").set({ duty: "Available" }).where("id", "=", job.staffId).execute();
      }
    });
    await syncJobsToCalendar([input.id]);
    await pushToLc(ctx.businessId, { jobIds: [input.id] });
    if (input.action !== "start") await maybeSendReviews(ctx.businessId);
    if (input.action !== "start") await maybeSyncXero(ctx.businessId);
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
