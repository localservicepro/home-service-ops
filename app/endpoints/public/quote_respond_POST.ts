import superjson from "superjson";
import { db } from "../../helpers/db";
import { businessBrand, esc, layout, sendAppEmail } from "../../helpers/mailer";
import { pricing } from "../../helpers/pricing";
import { pushToLc } from "../../helpers/lcSync";
import { schema, OutputType } from "./quote_respond_POST.schema";

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const q = await db.selectFrom("quotes").selectAll().where("publicToken", "=", input.token).executeTakeFirst();
    if (!q) throw new Error("This link isn't valid any more.");
    if (q.status !== "Awaiting") throw new Error(q.status === "Declined" ? "This quote was declined." : "This quote has already been accepted. Thanks!");
    const status = input.action === "accept" ? "Accepted" : "Declined";
    await db
      .updateTable("quotes")
      .set({ status, statusChangedAt: new Date(), declineReason: status === "Declined" ? input.reason || "Declined online" : null })
      .where("id", "=", q.id)
      .execute();
    await pushToLc(q.businessId, { quoteIds: [q.id] });

    // Let the business know straight away.
    try {
      const brand = await businessBrand(q.businessId);
      if (brand.email) {
        const accepted = status === "Accepted";
        const lines = [
          `<b>${esc(q.customer)}</b> ${accepted ? "accepted" : "declined"} quote <b>${esc(q.num)}</b> (${esc(q.service || "services")}, ${pricing.fmtMoney(Number(q.price))}).`,
          accepted ? "Open the quote in the app to book it in." : input.reason ? `Their reason: “${esc(input.reason)}”` : "",
        ].filter(Boolean);
        await sendAppEmail({
          to: brand.email,
          fromName: "Home Service Ops",
          subject: `${accepted ? "✅ Quote accepted" : "Quote declined"}: ${q.num} · ${q.customer}`,
          html: layout({ brand: brand.name, heading: accepted ? "Quote accepted" : "Quote declined", paragraphs: lines }),
          text: `${q.customer} ${accepted ? "accepted" : "declined"} quote ${q.num}.`,
        });
      }
    } catch (e) {
      console.error("Quote response notification failed", e instanceof Error ? e.message : e);
    }
    return new Response(superjson.stringify({ status } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
