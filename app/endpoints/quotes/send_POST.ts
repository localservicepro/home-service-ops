import superjson from "superjson";
import { db } from "../../helpers/db";
import { businessBrand, esc, isValidOrigin, layout, linkBase, sendAppEmail } from "../../helpers/mailer";
import { pricing } from "../../helpers/pricing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { sendSms } from "../../helpers/sms";
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
    const wantEmail = input.channel !== "sms";
    const wantSms = input.channel !== "email";
    // Text first: if it's the only route and it fails, nothing is marked as sent.
    let textedTo: string | null = null;
    let smsError: string | null = null;
    if (wantSms) {
      const note = input.message ? `${input.message}\n\n` : "";
      const r = await sendSms(ctx.businessId, {
        to: input.phone,
        kind: "quote",
        quoteId: q.id,
        message: `Hi ${first}, ${note}here's your quote ${q.num} from ${brand.name} (${total}). View and accept it here: ${url}`,
      });
      if (r.ok) textedTo = r.to;
      else if (!wantEmail) throw new Error(r.error);
      else smsError = r.error;
    }
    if (wantEmail) await sendAppEmail({
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
    const emailedTo = wantEmail ? input.to : null;
    const sentTo = [emailedTo, textedTo && input.phone].filter(Boolean).join(" and ");
    await db
      .updateTable("quotes")
      .set({ sentAt: new Date(), sentTo, ...(textedTo ? { smsSentAt: new Date(), smsSentTo: input.phone } : {}) })
      .where("id", "=", q.id)
      .execute();
    if (q.clientId) {
      if (emailedTo) await db.updateTable("clients").set({ email: emailedTo }).where("id", "=", q.clientId).where("email", "=", "").execute();
      if (textedTo) await db.updateTable("clients").set({ phone: input.phone }).where("id", "=", q.clientId).where("phone", "=", "").execute();
    }
    return new Response(superjson.stringify({ ok: true, sentTo, emailedTo, textedTo, smsError } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
