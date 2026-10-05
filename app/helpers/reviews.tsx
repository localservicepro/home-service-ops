import { randomBytes } from "node:crypto";
import { db } from "./db";
import { PUBLIC_APP_URL, businessBrand, esc, layout, sendAppEmail } from "./mailer";
import { API_URL } from "./serverEnv";

// Server-only. Google Business Profile (via Places API) + post-job review request emails.
// Requests are OFF unless the business turns them on in Settings.

const PLACES = "https://places.googleapis.com/v1";
const REASK_DAYS = 90;
export const DEFAULT_REVIEW_MESSAGE =
  "Thanks for choosing us! If you were happy with the job, would you mind leaving a quick Google review? It only takes a minute and really helps a local business like ours.";

function key() {
  const k = (process.env as Record<string, string | undefined>).GOOGLE_MAPS_API_KEY?.trim();
  if (!k) throw new Error("Google Business Profile isn't set up for this app yet.");
  return k;
}
export const isGbpConfigured = () => !!(process.env as Record<string, string | undefined>).GOOGLE_MAPS_API_KEY?.trim();
export const reviewLink = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

type Place = { id: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number; googleMapsUri?: string };

async function places<T>(path: string, init: { method?: string; body?: unknown; fields: string }): Promise<T> {
  const res = await fetch(`${PLACES}${path}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": init.fields },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Google: ${json.error?.message ?? `request failed (${res.status})`}`);
  return json;
}

export async function searchPlaces(query: string) {
  const r = await places<{ places?: Place[] }>("/places:searchText", {
    method: "POST",
    body: { textQuery: query, regionCode: "AU", pageSize: 8 },
    fields: "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
  });
  return (r.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? 0,
  }));
}

async function placeDetails(placeId: string) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) throw new Error("That listing couldn't be found.");
  return places<Place>(`/places/${placeId}`, { fields: "id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri" });
}

export async function connectGbp(businessId: number, placeId: string) {
  const p = await placeDetails(placeId);
  const row = {
    placeId: p.id,
    name: p.displayName?.text ?? "Your business",
    address: p.formattedAddress ?? "",
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? 0,
    mapsUrl: p.googleMapsUri ?? null,
    refreshedAt: new Date(),
  };
  await db
    .insertInto("gbpConnection")
    .values({ businessId, ...row, connectedAt: new Date() })
    .onConflict((oc) => oc.column("businessId").doUpdateSet({ ...row, connectedAt: new Date() }))
    .execute();
}

export async function disconnectGbp(businessId: number) {
  await db.deleteFrom("gbpConnection").where("businessId", "=", businessId).execute();
}

/** Status for the settings card and dashboard. Refreshes the rating at most every 6 hours. */
export async function gbpStatus(businessId: number) {
  let c = await db.selectFrom("gbpConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (c && isGbpConfigured() && Date.now() - c.refreshedAt.getTime() > 6 * 3600_000) {
    try {
      const p = await placeDetails(c.placeId);
      c = await db
        .updateTable("gbpConnection")
        .set({ rating: p.rating ?? null, reviewCount: p.userRatingCount ?? 0, name: p.displayName?.text ?? c.name, refreshedAt: new Date() })
        .where("businessId", "=", businessId)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch {
      /* keep the last known numbers */
    }
  }
  const since = new Date(Date.now() - 30 * 86_400_000);
  const sent = await db
    .selectFrom("jobs")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("businessId", "=", businessId)
    .where("reviewStatus", "=", "sent")
    .where("reviewRequestedAt", ">=", since)
    .executeTakeFirst();
  return {
    configured: isGbpConfigured(),
    connected: !!c,
    name: c?.name ?? null,
    address: c?.address ?? null,
    rating: c?.rating != null ? Number(c.rating) : null,
    reviewCount: c?.reviewCount ?? 0,
    mapsUrl: c?.mapsUrl ?? null,
    reviewUrl: c ? reviewLink(c.placeId) : null,
    sent30d: Number(sent?.n ?? 0),
  };
}

// ---------- sending ----------

async function unsubscribeUrl(clientId: number) {
  const c = await db.selectFrom("clients").select("reviewToken").where("id", "=", clientId).executeTakeFirst();
  let token = c?.reviewToken;
  if (!token) {
    token = randomBytes(18).toString("hex");
    await db.updateTable("clients").set({ reviewToken: token }).where("id", "=", clientId).execute();
  }
  return `${API_URL}/public/review_optout?t=${token}`;
}

function buildEmail(o: { brand: string; firstName: string; message: string; url: string; optOut?: string }) {
  const hi = o.firstName ? `Hi ${esc(o.firstName)},` : "Hi there,";
  const body = esc(o.message).replace(/\n+/g, "<br>");
  const html = layout({
    brand: o.brand,
    heading: "How did we do?",
    paragraphs: [hi, body, "⭐⭐⭐⭐⭐"],
    cta: { label: "Leave a Google review", url: o.url },
    footer: o.optOut ? `Don't want these emails? <a href="${esc(o.optOut)}" style="color:#8fa3bc">Unsubscribe from review requests</a>.` : undefined,
  });
  const text = `${o.firstName ? `Hi ${o.firstName},` : "Hi there,"}\n\n${o.message}\n\nLeave a Google review: ${o.url}${o.optOut ? `\n\nUnsubscribe from review requests: ${o.optOut}` : ""}`;
  return { html, text, subject: `How did we do? — ${o.brand}` };
}

type SendResult = { status: "sent" | "skipped"; reason?: string };

/** Sends (or skips, with a reason) the review request for one job. `force` = manual send from the office. */
export async function sendReviewRequest(businessId: number, jobId: number, opts: { force?: boolean } = {}): Promise<SendResult> {
  const job = await db
    .selectFrom("jobs")
    .leftJoin("clients", "clients.id", "jobs.clientId")
    .select(["jobs.id", "jobs.customer", "jobs.clientId", "jobs.reviewRequestedAt", "clients.email", "clients.reviewOptOut", "clients.name as clientName"])
    .where("jobs.id", "=", jobId)
    .where("jobs.businessId", "=", businessId)
    .executeTakeFirst();
  if (!job) throw new Error("Job not found");
  const skip = async (reason: string, status = "skipped"): Promise<SendResult> => {
    if (!opts.force) await db.updateTable("jobs").set({ reviewStatus: status, reviewRequestedAt: new Date() }).where("id", "=", jobId).execute();
    return { status: "skipped", reason };
  };
  const gbp = await db.selectFrom("gbpConnection").select("placeId").where("businessId", "=", businessId).executeTakeFirst();
  if (!gbp) throw new Error("Connect your Google Business Profile in Settings first.");
  if (!job.clientId || !job.email?.includes("@")) return skip("This client has no email address.", "no_email");
  if (job.reviewOptOut) return skip("This client has opted out of review requests.", "opted_out");
  if (!opts.force) {
    if (job.reviewRequestedAt) return { status: "skipped", reason: "Already asked for this job." };
    const recent = await db
      .selectFrom("jobs")
      .select("id")
      .where("businessId", "=", businessId)
      .where("clientId", "=", job.clientId)
      .where("reviewStatus", "=", "sent")
      .where("reviewRequestedAt", ">=", new Date(Date.now() - REASK_DAYS * 86_400_000))
      .executeTakeFirst();
    if (recent) return skip(`Client was already asked in the last ${REASK_DAYS} days.`, "recently_asked");
  }
  const [brand, s] = await Promise.all([
    businessBrand(businessId),
    db.selectFrom("settings").select("reviewMessage").where("businessId", "=", businessId).executeTakeFirst(),
  ]);
  const mail = buildEmail({
    brand: brand.name,
    firstName: (job.clientName || job.customer || "").trim().split(/\s+/)[0] ?? "",
    message: s?.reviewMessage?.trim() || DEFAULT_REVIEW_MESSAGE,
    url: reviewLink(gbp.placeId),
    optOut: await unsubscribeUrl(job.clientId),
  });
  try {
    await sendAppEmail({ to: job.email, subject: mail.subject, html: mail.html, text: mail.text, fromName: brand.name, replyTo: brand.email || undefined });
  } catch (e) {
    await db.updateTable("jobs").set({ reviewStatus: "failed", reviewRequestedAt: new Date() }).where("id", "=", jobId).execute();
    throw e;
  }
  await db.updateTable("jobs").set({ reviewStatus: "sent", reviewRequestedAt: new Date() }).where("id", "=", jobId).execute();
  return { status: "sent" };
}

/** Test email to the owner with the business's current wording. */
export async function sendReviewTest(businessId: number, to: string) {
  const gbp = await db.selectFrom("gbpConnection").select("placeId").where("businessId", "=", businessId).executeTakeFirst();
  if (!gbp) throw new Error("Connect your Google Business Profile first.");
  const [brand, s] = await Promise.all([
    businessBrand(businessId),
    db.selectFrom("settings").select("reviewMessage").where("businessId", "=", businessId).executeTakeFirst(),
  ]);
  const mail = buildEmail({ brand: brand.name, firstName: "", message: s?.reviewMessage?.trim() || DEFAULT_REVIEW_MESSAGE, url: reviewLink(gbp.placeId) });
  await sendAppEmail({ to, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text, fromName: brand.name });
}

/**
 * Sends any review requests that are due for a business. Safe to call often (after status
 * changes, from the office sync). Does nothing unless requests are turned on and GBP is connected.
 * Only jobs that reached the trigger status after requests were turned on are considered.
 */
export async function processReviewRequests(businessId: number) {
  const s = await db
    .selectFrom("settings")
    .select(["reviewRequestsEnabled", "reviewTrigger", "reviewDelayMinutes", "reviewEnabledAt"])
    .where("businessId", "=", businessId)
    .executeTakeFirst();
  if (!s?.reviewRequestsEnabled || !s.reviewEnabledAt || !isGbpConfigured()) return 0;
  const gbp = await db.selectFrom("gbpConnection").select("placeId").where("businessId", "=", businessId).executeTakeFirst();
  if (!gbp) return 0;
  const statuses = s.reviewTrigger === "done" ? (["Done", "Paid"] as const) : (["Paid"] as const);
  const dueBefore = new Date(Date.now() - Math.max(0, s.reviewDelayMinutes) * 60_000);
  const jobs = await db
    .selectFrom("jobs")
    .select("id")
    .where("businessId", "=", businessId)
    .where("status", "in", [...statuses])
    .where("reviewRequestedAt", "is", null)
    .where("reviewStatus", "is", null)
    .where("statusChangedAt", ">=", s.reviewEnabledAt)
    .where("statusChangedAt", "<=", dueBefore)
    .orderBy("statusChangedAt")
    .limit(10)
    .execute();
  let sent = 0;
  for (const j of jobs) {
    try {
      const r = await sendReviewRequest(businessId, j.id);
      if (r.status === "sent") sent++;
    } catch {
      /* marked failed inside; carry on */
    }
  }
  return sent;
}

/** Fire-and-forget variant for status-change hooks: never throws. */
export async function maybeSendReviews(businessId: number) {
  await processReviewRequests(businessId).catch(() => 0);
}

