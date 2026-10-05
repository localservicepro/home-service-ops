import superjson from "superjson";
import { db } from "../../helpers/db";
import { ensureClient } from "../../helpers/ensureClient";
import { pricing } from "../../helpers/pricing";
import { syncJobsToCalendar } from "../../helpers/calendarSync";
import { assertJobCapacity } from "../../helpers/billing";
import { pushToLc } from "../../helpers/lcSync";
import { maybeSendReviews } from "../../helpers/reviews";
import { maybeSyncXero } from "../../helpers/xero";
import { ANY_MEMBER, ForbiddenError, assertJobAccess, errorResponse, isOffice, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./save_POST.schema";

// Fields crew may change on their own jobs (photos and notes from the field).
const CREW_FIELDS = new Set(["id", "photos", "notes"]);

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request, ANY_MEMBER);
    const input = schema.parse(superjson.parse(await request.text()));
    const biz = ctx.businessId;
    if (!isOffice(ctx)) {
      if (!input.id) throw new ForbiddenError("Only the office can create jobs.");
      const extra = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined && !CREW_FIELDS.has(k));
      if (extra.length) throw new ForbiddenError("Crew can only add photos and notes to a job.");
      await assertJobAccess(ctx, input.id);
    }

    const result = await db.transaction().execute(async (trx) => {
      const existing = input.id
        ? await trx.selectFrom("jobs").selectAll().where("id", "=", input.id).where("businessId", "=", biz).executeTakeFirst()
        : undefined;
      if (input.id && !existing) throw new Error("Job not found");

      // Plan limit: scheduling a job into a month (new, moved to another month, or un-cancelled).
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const prevDate = existing?.scheduledDate ? iso(existing.scheduledDate) : null;
      const nextDate = input.scheduledDate !== undefined ? input.scheduledDate : prevDate;
      const nextStatus = input.status ?? existing?.status ?? "New";
      const prevCounted = !!prevDate && existing?.status !== "Cancelled";
      if (nextDate && nextStatus !== "Cancelled" && (!prevCounted || prevDate!.slice(0, 7) !== nextDate.slice(0, 7))) {
        await assertJobCapacity(biz, nextDate, existing?.id);
      }

      const values: Record<string, unknown> = {};
      const copy = [
        "customer", "address", "phone", "service", "scheduledDate", "scheduledTime", "status",
        "staffId", "freq", "notes", "gst", "crewPay", "crewPayType", "payMethod", "payState",
        "photos", "discount",
      ] as const;
      for (const k of copy) if (input[k] !== undefined) values[k] = input[k];

      // Price follows the line items whenever lines are supplied.
      if (input.lines !== undefined) {
        values.lines = input.lines;
        if (input.lines.length) {
          const t = pricing.calcTotals(
            input.lines,
            input.discount ?? existing?.discount ?? 0,
            input.gst ?? existing?.gst ?? false,
          );
          values.price = t.total;
          if (input.service === undefined) {
            values.service = input.lines.filter((l) => l.kind === "service").map((l) => l.name).join(", ") ||
              existing?.service || input.lines[0].name;
          }
        } else if (input.price !== undefined) values.price = input.price;
      } else if (input.price !== undefined) values.price = input.price;

      // Default crew pay to the crew member's rate when (re)assigned.
      if (input.staffId !== undefined && input.staffId !== existing?.staffId && input.crewPay === undefined) {
        if (input.staffId) {
          const st = await trx
            .selectFrom("staff")
            .select(["rate", "rateType"])
            .where("id", "=", input.staffId)
            .where("businessId", "=", biz)
            .executeTakeFirst();
          if (!st) throw new Error("Crew member not found");
          values.crewPay = st.rate;
          values.crewPayType = st.rateType;
        } else {
          values.crewPay = null;
          values.crewPayType = null;
        }
      }

      if (input.status && input.status !== existing?.status) values.statusChangedAt = new Date();

      // Link to (or create) the client record for new jobs / changed customers.
      const customer = input.customer ?? existing?.customer;
      if (customer && (input.clientId !== undefined || input.customer !== undefined || !existing)) {
        values.clientId = await ensureClient(trx, biz, {
          clientId: input.clientId ?? null,
          name: customer,
          address: input.address ?? existing?.address,
          phone: input.phone ?? existing?.phone,
        });
      }

      if (existing) {
        if (!Object.keys(values).length) return { id: existing.id, num: existing.num };
        const row = await trx
          .updateTable("jobs")
          .set(values)
          .where("id", "=", existing.id)
          .returning(["id", "num"])
          .executeTakeFirstOrThrow();
        return row;
      }

      if (!customer) throw new Error("Customer is required");
      const row = await trx
        .insertInto("jobs")
        .values({ customer, ...values, businessId: biz } as { customer: string; businessId: number })
        .returning(["id", "num"])
        .executeTakeFirstOrThrow();
      return row;
    });

    await syncJobsToCalendar([result.id]);
    await pushToLc(biz, { jobIds: [result.id] });
    if (input.status === "Done" || input.status === "Paid") await maybeSendReviews(biz);
    if (input.status === "Paid" || input.status === "Done") await maybeSyncXero(biz);
    return new Response(superjson.stringify(result satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
