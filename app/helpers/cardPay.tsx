import { db } from "./db";
import { checkJobPayment, createJobPaymentLink } from "./stripeConnect";
import { checkSquarePayment, createSquareLink } from "./squareConnect";

// Server-only. Routes card pay-now links to the business's chosen card provider.

export type CardProvider = "stripe" | "square";

/** The card provider invoices use: the chosen one if connected, else whichever is connected. */
export async function cardProviderFor(businessId: number): Promise<CardProvider | null> {
  const [s, stripe, square] = await Promise.all([
    db.selectFrom("settings").select("cardProvider").where("businessId", "=", businessId).executeTakeFirst(),
    db.selectFrom("stripeConnection").select("businessId").where("businessId", "=", businessId).executeTakeFirst(),
    db.selectFrom("squareConnection").select("businessId").where("businessId", "=", businessId).executeTakeFirst(),
  ]);
  const pref = s?.cardProvider === "square" ? "square" : "stripe";
  if (pref === "square" && square) return "square";
  if (pref === "stripe" && stripe) return "stripe";
  return stripe ? "stripe" : square ? "square" : null;
}

export async function createCardLink(businessId: number, jobId: number, provider: CardProvider) {
  if (provider === "square") return createSquareLink(businessId, jobId);
  const r = await createJobPaymentLink(businessId, jobId);
  await db.updateTable("jobs").set({ payProvider: "stripe" }).where("id", "=", jobId).execute();
  return r;
}

/** Checks whichever provider the job's card link was created with. */
export async function checkAnyPayment(businessId: number, jobId: number) {
  const job = await db
    .selectFrom("jobs")
    .select(["status", "payProvider", "stripeLinkId", "squareOrderId"])
    .where("id", "=", jobId)
    .where("businessId", "=", businessId)
    .executeTakeFirst();
  if (!job) throw new Error("Job not found");
  if (job.status === "Paid") return { paid: true, justPaid: false };
  if (job.payProvider === "square" || (!job.stripeLinkId && job.squareOrderId)) return checkSquarePayment(businessId, jobId);
  if (job.stripeLinkId) return checkJobPayment(businessId, jobId);
  return { paid: false, justPaid: false };
}

/** Catch-up for Square links (Stripe relies on its webhook + in-app polling). */
export async function syncPendingCard(businessId: number) {
  const jobs = await db
    .selectFrom("jobs")
    .select("id")
    .where("businessId", "=", businessId)
    .where("status", "!=", "Paid")
    .where("payProvider", "=", "square")
    .where("squareOrderId", "is not", null)
    .orderBy("id", "desc")
    .limit(15)
    .execute();
  let n = 0;
  for (const j of jobs) {
    const r = await checkSquarePayment(businessId, j.id).catch(() => ({ justPaid: false }));
    if (r.justPaid) n++;
  }
  return n;
}
