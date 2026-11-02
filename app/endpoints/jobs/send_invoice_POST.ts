import superjson from "superjson";
import { db } from "../../helpers/db";
import { businessBrand, esc, isValidOrigin, layout, linkBase, sendAppEmail } from "../../helpers/mailer";
import { invoiceNum } from "../../helpers/publicDocs";
import { pricing } from "../../helpers/pricing";
import { errorResponse, requireMember } from "../../helpers/tenant";
import { sendSms } from "../../helpers/sms";
import { schema, OutputType } from "./send_invoice_POST.schema";

export async function handle(request: Request) {
  try {
    const ctx = await requireMember(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if (!isValidOrigin(input.origin)) throw new Error("Invalid origin");
    const j = await db.selectFrom("jobs").selectAll().where("id", "=", input.jobId).where("businessId", "=", ctx.businessId).executeTakeFirst();
    if (!j) throw new Error("Job not found");
    const brand = await businessBrand(ctx.businessId);
    const url = `${linkBase(input.origin)}/i/${j.publicToken}`;
    const inv = invoiceNum(j.num);
    const first = j.customer.split(" ")[0];
    const total = pricing.fmtMoney(Number(j.price));
    const paid = j.status === "Paid";
    const wantEmail = input.channel !== "sms";
    const wantSms = input.channel !== "email";
    let textedTo: string | null = null;
    let smsError: string | null = null;
    if (wantSms) {
      const note = input.message ? `${input.message}\n\n` : "";
      const r = await sendSms(ctx.businessId, {
        to: input.phone,
        kind: "invoice",
        jobId: j.id,
        message: paid
          ? `Hi ${first}, ${note}thanks for your payment. Your receipt ${inv} from ${brand.name}: ${url}`
          : `Hi ${first}, ${note}here's invoice ${inv} from ${brand.name} for ${total}. View and pay online: ${url}`,
      });
      if (r.ok) textedTo = r.to;
      else if (!wantEmail) throw new Error(r.error);
      else smsError = r.error;
    }
    if (wantEmail) await sendAppEmail({
      to: input.to,
      fromName: brand.name,
      replyTo: brand.email || undefined,
      subject: paid ? `Receipt from ${brand.name} (${inv})` : `Invoice ${inv} from ${brand.name} · ${total}`,
      html: layout({
        brand: brand.name,
        heading: paid ? `Receipt ${inv} · ${total} paid` : `Invoice ${inv} · ${total}`,
        paragraphs: [
          `Hi ${esc(first)},`,
          input.message
            ? esc(input.message).replace(/\n/g, "<br>")
            : paid
              ? `Thanks for your payment for <b>${esc(j.service || "our work")}</b>. Your receipt is below.`
              : `Thanks for choosing us for <b>${esc(j.service || "the work")}</b>${j.address ? ` at ${esc(j.address)}` : ""}. Here's your invoice.`,
          paid ? "" : `Amount due: <b>${total}</b>.`,
        ].filter(Boolean),
        cta: { label: paid ? "View receipt" : "View & pay invoice", url },
        footer: [brand.phone && `Questions? Call ${esc(brand.phone)}`, brand.email && `or reply to this email`].filter(Boolean).join(" "),
      }),
      text: `Hi ${first}, ${paid ? "here's your receipt" : `here's invoice ${inv} for ${total}`} from ${brand.name}: ${url}`,
    });
    const emailedTo = wantEmail ? input.to : null;
    const sentTo = [emailedTo, textedTo && input.phone].filter(Boolean).join(" and ");
    await db
      .updateTable("jobs")
      .set({
        invoiceSentAt: new Date(),
        invoiceSentTo: sentTo,
        ...(textedTo ? { invoiceSmsAt: new Date(), invoiceSmsTo: input.phone } : {}),
        ...(paid ? {} : { payState: "awaiting" as const, payMethod: j.payMethod ?? "online" }),
      })
      .where("id", "=", j.id)
      .execute();
    if (j.clientId) {
      if (emailedTo) await db.updateTable("clients").set({ email: emailedTo }).where("id", "=", j.clientId).where("email", "=", "").execute();
      if (textedTo) await db.updateTable("clients").set({ phone: input.phone }).where("id", "=", j.clientId).where("phone", "=", "").execute();
    }
    return new Response(superjson.stringify({ ok: true, sentTo, emailedTo, textedTo, smsError } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
