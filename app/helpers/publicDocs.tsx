import { db } from "./db";
import { pricing } from "./pricing";

// Server-only. Customer-facing view of a quote or an invoice (a job), looked up by its
// unguessable public token. Only fields a customer should see are returned.

export type PublicLine = { name: string; qty: number; price: number; addon: boolean };
export type PublicDoc = {
  kind: "quote" | "invoice";
  num: string;
  date: Date;
  customer: string;
  address: string;
  lines: PublicLine[];
  sub: number;
  disc: number;
  gst: number;
  total: number;
  note: string;
  business: { name: string; phone: string; email: string; abn: string; address: string; website: string };
  quoteStatus?: "Awaiting" | "Accepted" | "Declined" | "Converted";
  invoice?: {
    paid: boolean;
    payOnline: boolean;
    bank: { name: string; bank: string; bsb: string; acct: string } | null;
    /** Which card provider the "Pay now by card" button uses. */
    card?: "stripe" | "square" | null;
    /** GoCardless direct debit available for this invoice. */
    directDebit?: boolean;
    /** Direct debit already started for this invoice (pending = charged, waiting to clear). */
    ddStatus?: "none" | "setup_sent" | "pending" | "failed";
    /** Xero online invoice (pay there) when the business invoices through Xero. */
    xeroUrl?: string | null;
  };
};

const toLines = (v: unknown): PublicLine[] =>
  (Array.isArray(v) ? v : []).map((l: { name?: string; qty?: unknown; price?: unknown; kind?: string }) => ({
    name: String(l.name ?? ""),
    qty: Math.max(1, parseInt(String(l.qty), 10) || 1),
    price: pricing.toNum(l.price),
    addon: l.kind === "addon",
  }));

export const invoiceNum = (jobNum: string) => "INV-" + jobNum.replace(/^LC-/, "");

async function brand(businessId: number) {
  const s = await db.selectFrom("settings").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  const b = (s?.business ?? {}) as Record<string, string>;
  const biz = await db.selectFrom("businesses").select("name").where("id", "=", businessId).executeTakeFirstOrThrow();
  return {
    settings: s,
    business: {
      name: b.name || biz.name,
      phone: b.phone || "",
      email: b.email || "",
      abn: b.abn || "",
      address: b.address || "",
      website: b.website || "",
    },
  };
}

export async function loadPublicDoc(kind: "quote" | "invoice", token: string): Promise<(PublicDoc & { businessId: number; id: number }) | null> {
  if (kind === "quote") {
    const q = await db.selectFrom("quotes").selectAll().where("publicToken", "=", token).executeTakeFirst();
    if (!q) return null;
    const { business } = await brand(q.businessId);
    const lines = toLines(q.lines);
    const t = pricing.calcTotals(lines, q.discount, q.gst);
    return {
      id: q.id,
      businessId: q.businessId,
      kind,
      num: q.num,
      date: q.sentAt ?? q.createdAt,
      customer: q.customer,
      address: q.address,
      lines,
      ...t,
      total: lines.length ? t.total : Number(q.price),
      note: q.note,
      business,
      quoteStatus: q.status,
    };
  }
  const j = await db.selectFrom("jobs").selectAll().where("publicToken", "=", token).executeTakeFirst();
  if (!j) return null;
  const { business, settings } = await brand(j.businessId);
  const lines = toLines(j.lines);
  const t = pricing.calcTotals(lines, j.discount, j.gst);
  const accept = (settings?.accept ?? {}) as { online?: boolean; bank?: boolean };
  const bank = settings?.bankInfo as { name?: string; bank?: string; bsb?: string; acct?: string } | undefined;
  const [stripe, square, gcConn] = await Promise.all([
    db.selectFrom("stripeConnection").select("accountId").where("businessId", "=", j.businessId).executeTakeFirst(),
    db.selectFrom("squareConnection").select("merchantId").where("businessId", "=", j.businessId).executeTakeFirst(),
    db.selectFrom("gocardlessConnection").select("organisationId").where("businessId", "=", j.businessId).executeTakeFirst(),
  ]);
  const pref = settings?.cardProvider === "square" ? "square" : "stripe";
  const card: "stripe" | "square" | null =
    accept.online === false ? null : pref === "square" && square ? "square" : stripe ? "stripe" : square ? "square" : null;
  const deadDd = ["failed", "cancelled", "customer_approval_denied", "charged_back"];
  const ddStatus = j.gcPaymentId ? (deadDd.includes(j.gcPaymentStatus ?? "") ? "failed" : "pending") : j.gcBillingRequestId ? "setup_sent" : "none";
  return {
    id: j.id,
    businessId: j.businessId,
    kind,
    num: invoiceNum(j.num),
    date: j.invoiceSentAt ?? j.statusChangedAt,
    customer: j.customer,
    address: j.address,
    lines: lines.length ? lines : [{ name: j.service || "Service", qty: 1, price: Number(j.price), addon: false }],
    ...(lines.length ? t : { sub: Number(j.price), disc: 0, gst: 0 }),
    total: Number(j.price),
    note: "",
    business,
    invoice: {
      paid: j.status === "Paid",
      payOnline: !!card,
      bank: accept.bank !== false && bank?.acct ? { name: bank.name ?? "", bank: bank.bank ?? "", bsb: bank.bsb ?? "", acct: bank.acct ?? "" } : null,
      card,
      directDebit: !!gcConn && settings?.directDebit !== false,
      ddStatus,
      xeroUrl: j.xeroStatus === "awaiting" ? j.xeroOnlineUrl : null,
    },
  };
}
