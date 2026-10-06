import superjson from "superjson";
import { db } from "../../helpers/db";
import { syncJobsToCalendar } from "../../helpers/calendarSync";
import { assertJobCapacity } from "../../helpers/billing";
import { pushToLc } from "../../helpers/lcSync";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./book_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const biz = ctx.businessId;
    const input = schema.parse(superjson.parse(await request.text()));
    const out = await db.transaction().execute(async (trx) => {
      const q = await trx.selectFrom("quotes").selectAll().where("id", "=", input.quoteId).where("businessId", "=", biz).forUpdate().executeTakeFirst();
      if (!q) throw new Error("Quote not found");
      if (q.status === "Converted") throw new Error(`Already booked as ${q.jobNum}`);
      if (q.status === "Declined") throw new Error("This quote was declined — resend it before booking");
      const st = await trx.selectFrom("staff").select(["rate", "rateType"]).where("id", "=", input.staffId).where("businessId", "=", biz).executeTakeFirst();
      if (!st) throw new Error("Crew member not found");
      await assertJobCapacity(biz, input.scheduledDate);

      let phone = "";
      if (q.clientId) {
        const c = await trx.selectFrom("clients").select("phone").where("id", "=", q.clientId).executeTakeFirst();
        phone = c?.phone ?? "";
      }

      const booking = {
        clientId: q.clientId,
        customer: q.customer,
        address: q.address,
        service: q.service,
        scheduledDate: input.scheduledDate,
        scheduledTime: input.scheduledTime,
        status: "Job Scheduled" as const,
        statusChangedAt: new Date(),
        price: q.price,
        staffId: input.staffId,
        crewPay: st.rate,
        crewPayType: st.rateType,
        freq: input.freq ?? "One-time",
        lines: q.lines,
        discount: q.discount,
        gst: q.gst,
        quoteId: q.id,
      };

      // A quote made from a request books that same request (one lead, one job).
      const req = q.requestJobId
        ? await trx
            .selectFrom("jobs")
            .select(["id", "status", "phone", "notes", "lcOpportunityId"])
            .where("id", "=", q.requestJobId)
            .where("businessId", "=", biz)
            .executeTakeFirst()
        : undefined;
      const job =
        req && (req.status === "New" || req.status === "Quote Sent")
          ? await trx
              .updateTable("jobs")
              .set({
                ...booking,
                phone: req.phone || phone,
                notes: [req.notes, q.note].filter(Boolean).join("\n\n"),
                lcOpportunityId: req.lcOpportunityId ?? q.lcOpportunityId,
              })
              .where("id", "=", req.id)
              .returning(["id", "num"])
              .executeTakeFirstOrThrow()
          : await trx
              .insertInto("jobs")
              .values({ ...booking, businessId: biz, phone, notes: q.note, source: "quote", lcOpportunityId: q.lcOpportunityId })
              .returning(["id", "num"])
              .executeTakeFirstOrThrow();

      await trx
        .updateTable("quotes")
        .set({ status: "Converted", jobNum: job.num, statusChangedAt: new Date() })
        .where("id", "=", q.id)
        .execute();

      return { jobId: job.id, jobNum: job.num };
    });
    await syncJobsToCalendar([out.jobId]);
    await pushToLc(biz, { jobIds: [out.jobId] });
    return new Response(superjson.stringify(out satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
