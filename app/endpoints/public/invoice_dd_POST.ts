import superjson from "superjson";
import { db } from "../../helpers/db";
import { ddStateFor, startJobDirectDebit, syncGcJob } from "../../helpers/goCardless";
import { schema, OutputType } from "./invoice_dd_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const j = await db.selectFrom("jobs").select(["id", "businessId", "status"]).where("publicToken", "=", input.token).executeTakeFirst();
    if (!j) throw new Error("This link isn't valid any more.");
    const s = await db.selectFrom("settings").select("directDebit").where("businessId", "=", j.businessId).executeTakeFirst();
    if (s && !s.directDebit) throw new Error("Direct debit isn't available for this invoice.");
    const st = input.check
      ? await syncGcJob(j.businessId, j.id).catch(() => ddStateFor(j.businessId, j.id))
      : j.status === "Paid"
        ? await ddStateFor(j.businessId, j.id)
        : await startJobDirectDebit(j.businessId, j.id);
    const out: OutputType = { status: st.status, url: st.status === "setup_sent" ? st.setupUrl : null };
    return new Response(superjson.stringify(out));
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
