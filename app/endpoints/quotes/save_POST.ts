import superjson from "superjson";
import { db } from "../../helpers/db";
import { ensureClient } from "../../helpers/ensureClient";
import { pricing } from "../../helpers/pricing";
import { pushToLc } from "../../helpers/lcSync";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./save_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const biz = ctx.businessId;
    const input = schema.parse(superjson.parse(await request.text()));
    const out = await db.transaction().execute(async (trx) => {
      const existing = input.id
        ? await trx.selectFrom("quotes").selectAll().where("id", "=", input.id).where("businessId", "=", biz).executeTakeFirst()
        : undefined;
      if (input.id && !existing) throw new Error("Quote not found");
      if (existing?.status === "Converted" && (input.lines || input.status)) {
        throw new Error("This quote has already been booked as a job");
      }

      const values: Record<string, unknown> = {};
      const isContentEdit = input.lines !== undefined || input.customer !== undefined || !existing;

      if (isContentEdit) {
        const customer = input.customer ?? existing?.customer;
        if (!customer) throw new Error("Pick a customer first");
        const lines = input.lines ?? (existing?.lines as never[]) ?? [];
        if (!lines.length) throw new Error("Add at least one line item");
        const discount = input.discount ?? Number(existing?.discount ?? 0);
        const gst = input.gst ?? existing?.gst ?? false;
        const t = pricing.calcTotals(lines, discount, gst);
        const address = input.address ?? existing?.address ?? "";
        Object.assign(values, {
          customer,
          address,
          note: input.note ?? existing?.note ?? "",
          lines,
          discount,
          gst,
          price: t.total,
          service: (lines as { kind: string; name: string }[]).filter((l) => l.kind !== "addon").map((l) => l.name).join(", "),
          clientId: await ensureClient(trx, biz, { clientId: input.clientId ?? null, name: customer, address }),
          // Sending (or resending) a quote puts it back to awaiting a reply.
          status: "Awaiting",
          declineReason: null,
          statusChangedAt: new Date(),
        });
      } else if (input.note !== undefined) {
        values.note = input.note;
      }

      if (input.status && !isContentEdit) {
        values.status = input.status;
        values.statusChangedAt = new Date();
        values.declineReason = input.status === "Declined" ? input.declineReason ?? null : null;
      }

      if (existing) {
        const row = await trx.updateTable("quotes").set(values).where("id", "=", existing.id).returning(["id", "num", "requestJobId"]).executeTakeFirstOrThrow();
        return row;
      }

      // Quoting a request: link it, carry its CRM opportunity, and move it to "Quote Sent".
      let requestJobId: number | null = null;
      if (input.fromJobId) {
        const req = await trx
          .selectFrom("jobs")
          .select(["id", "status", "lcOpportunityId"])
          .where("id", "=", input.fromJobId)
          .where("businessId", "=", biz)
          .executeTakeFirst();
        if (req && (req.status === "New" || req.status === "Quote Sent")) {
          requestJobId = req.id;
          values.requestJobId = req.id;
          values.lcOpportunityId = req.lcOpportunityId;
          if (req.status === "New") {
            await trx.updateTable("jobs").set({ status: "Quote Sent", statusChangedAt: new Date() }).where("id", "=", req.id).execute();
          }
        }
      }
      const row = await trx
        .insertInto("quotes")
        .values({ ...values, businessId: biz } as { customer: string; businessId: number })
        .returning(["id", "num", "requestJobId"])
        .executeTakeFirstOrThrow();
      return { ...row, requestJobId: row.requestJobId ?? requestJobId };
    });
    // The linked request carries the opportunity forward; a stand-alone quote has its own.
    await pushToLc(biz, out.requestJobId ? { jobIds: [out.requestJobId], quoteIds: [out.id] } : { quoteIds: [out.id] });
    return new Response(superjson.stringify({ id: out.id, num: out.num } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
