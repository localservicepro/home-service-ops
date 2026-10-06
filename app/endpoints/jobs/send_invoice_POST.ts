import superjson from "superjson";
import { db } from "../../helpers/db";
import { businessBrand, esc, isValidOrigin, layout, linkBase, sendAppEmail } from "../../helpers/mailer";
import { invoiceNum } from "../../helpers/publicDocs";
import { pricing } from "../../helpers/pricing";
import { errorResponse, requireMember } from "../../helpers/tenant";
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
    await sendAppEmail({
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
    await db
      .updateTable("jobs")
      .set({ invoiceSentAt: new Date(), invoiceSentTo: input.to, ...(paid ? {} : { payState: "awaiting" as const, payMethod: j.payMethod ?? "online" }) })
      .where("id", "=", j.id)
      .execute();
    if (j.clientId) {
      await db.updateTable("clients").set({ email: input.to }).where("id", "=", j.clientId).where("email", "=", "").execute();
    }
    return new Response(superjson.stringify({ ok: true, sentTo: input.to } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
