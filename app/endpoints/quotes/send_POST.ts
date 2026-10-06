import superjson from "superjson";
import { db } from "../../helpers/db";
import { businessBrand, esc, isValidOrigin, layout, linkBase, sendAppEmail } from "../../helpers/mailer";
import { pricing } from "../../helpers/pricing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { schema, OutputType } from "./send_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if (!isValidOrigin(input.origin)) throw new Error("Invalid origin");
    const q = await db.selectFrom("quotes").selectAll().where("id", "=", input.quoteId).where("businessId", "=", ctx.businessId).executeTakeFirst();
    if (!q) throw new Error("Quote not found");
    if (q.status === "Converted") throw new Error("This quote has already been booked as a job.");
    const brand = await businessBrand(ctx.businessId);
    const url = `${linkBase(input.origin)}/q/${q.publicToken}`;
    const first = q.customer.split(" ")[0];
    const total = pricing.fmtMoney(Number(q.price));
    const paragraphs = [
      `Hi ${esc(first)},`,
      input.message ? esc(input.message).replace(/\n/g, "<br>") : `Thanks for the opportunity. Here's your quote for <b>${esc(q.service || "the work")}</b>${q.address ? ` at ${esc(q.address)}` : ""}.`,
      `Total: <b>${total}</b>. You can view the full breakdown and accept it online.`,
    ];
    await sendAppEmail({
      to: input.to,
      fromName: brand.name,
      replyTo: brand.email || undefined,
      subject: `Your quote from ${brand.name} (${q.num})`,
      html: layout({
        brand: brand.name,
        heading: `Quote ${q.num} · ${total}`,
        paragraphs,
        cta: { label: "View & accept quote", url },
        footer: [brand.phone && `Questions? Call ${esc(brand.phone)}`, brand.email && `or reply to this email`].filter(Boolean).join(" "),
      }),
      text: `Hi ${first}, here's your quote ${q.num} from ${brand.name} (${total}). View and accept it here: ${url}`,
    });
    await db
      .updateTable("quotes")
      .set({ sentAt: new Date(), sentTo: input.to, ...(q.status === "Declined" ? {} : {}) })
      .where("id", "=", q.id)
      .execute();
    if (q.clientId) {
      await db.updateTable("clients").set({ email: input.to }).where("id", "=", q.clientId).where("email", "=", "").execute();
    }
    return new Response(superjson.stringify({ ok: true, sentTo: input.to } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
