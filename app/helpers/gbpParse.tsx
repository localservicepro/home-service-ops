// Shared, no I/O: Google Business Profile API answers turned into the app's shapes.

export type GbpLocation = {
  /** "locations/123" */
  name: string;
  /** "accounts/456" */
  account: string;
  accountLabel: string;
  title: string;
  address: string;
  placeId: string | null;
  mapsUrl: string | null;
  reviewUrl: string | null;
  phone: string | null;
  website: string | null;
  /** Google says this login can manage the listing (it's verified and theirs). */
  verified: boolean;
};

export type GbpReview = {
  reviewId: string;
  stars: number;
  comment: string;
  reviewerName: string;
  reviewerPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
  reply: string | null;
  repliedAt: Date | null;
};

export type GbpMetric = "views" | "calls" | "website" | "directions";
export type GbpInsights = {
  /** The last 30 days, ending yesterday (Google's numbers lag a day or two). */
  from: string;
  to: string;
  totals: Record<GbpMetric, number>;
  /** The 30 days before, to compare with. */
  previous: Record<GbpMetric, number>;
  /** Views per day for the chart: [YYYY-MM-DD, views]. */
  daily: [string, number][];
};

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

type RawAddress = { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
type RawLocation = {
  name?: string;
  title?: string;
  storefrontAddress?: RawAddress;
  websiteUri?: string;
  phoneNumbers?: { primaryPhone?: string };
  metadata?: { placeId?: string; mapsUri?: string; newReviewUri?: string; hasVoiceOfMerchant?: boolean };
};

export function formatAddress(a?: RawAddress) {
  if (!a) return "";
  const street = (a.addressLines ?? []).filter(Boolean).join(", ");
  const tail = [a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(" ");
  return [street, tail].filter(Boolean).join(", ");
}

export function parseLocations(account: { name: string; accountName?: string }, json: unknown): GbpLocation[] {
  const list = ((json as { locations?: RawLocation[] })?.locations ?? []).filter((l) => l.name);
  return list.map((l) => ({
    name: l.name!,
    account: account.name,
    accountLabel: account.accountName ?? "",
    title: l.title ?? "Untitled listing",
    address: formatAddress(l.storefrontAddress),
    placeId: l.metadata?.placeId ?? null,
    mapsUrl: l.metadata?.mapsUri ?? null,
    reviewUrl: l.metadata?.newReviewUri ?? null,
    phone: l.phoneNumbers?.primaryPhone ?? null,
    website: l.websiteUri ?? null,
    verified: !!l.metadata?.hasVoiceOfMerchant,
  }));
}

type RawReview = {
  reviewId?: string;
  name?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

/** Google adds "(Translated by Google) …" under the original for other languages: keep the original. */
export function cleanComment(c: string) {
  const i = c.indexOf("\n\n(Translated by Google)");
  if (i > 0) return c.slice(0, i).trim();
  const m = /^\(Translated by Google\)[\s\S]*?\n\n\(Original\)\n([\s\S]*)$/.exec(c);
  return (m ? m[1] : c).trim();
}

export function parseReviews(json: unknown): { reviews: GbpReview[]; average: number | null; total: number | null; next: string | null } {
  const j = (json ?? {}) as { reviews?: RawReview[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string };
  const reviews = (j.reviews ?? [])
    .map((r) => {
      const id = r.reviewId || r.name?.split("/").pop();
      if (!id) return null;
      const created = new Date(r.createTime ?? r.updateTime ?? Date.now());
      return {
        reviewId: id,
        stars: STARS[r.starRating ?? ""] ?? 0,
        comment: cleanComment(r.comment ?? ""),
        reviewerName: r.reviewer?.isAnonymous ? "A Google user" : (r.reviewer?.displayName ?? "").trim() || "A Google user",
        reviewerPhoto: r.reviewer?.profilePhotoUrl ?? null,
        createdAt: created,
        updatedAt: new Date(r.updateTime ?? r.createTime ?? Date.now()),
        reply: r.reviewReply?.comment?.trim() || null,
        repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
      } satisfies GbpReview;
    })
    .filter((r): r is GbpReview => !!r);
  return { reviews, average: j.averageRating ?? null, total: j.totalReviewCount ?? null, next: j.nextPageToken || null };
}

const METRICS: Record<string, GbpMetric> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "views",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "views",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "views",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "views",
  CALL_CLICKS: "calls",
  WEBSITE_CLICKS: "website",
  BUSINESS_DIRECTION_REQUESTS: "directions",
};
export const INSIGHT_METRICS = Object.keys(METRICS);

type RawSeries = { dailyMetric?: string; timeSeries?: { datedValues?: { date?: { year: number; month: number; day: number }; value?: string }[] } };
const iso = (d: { year: number; month: number; day: number }) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

/**
 * fetchMultiDailyMetricsTimeSeries answer (covering 60 days) → this period, the one before, and
 * daily views. Days without a value count as 0 (Google leaves them out).
 */
export function parseInsights(json: unknown, from: string, to: string, prevFrom: string): GbpInsights {
  const zero = (): Record<GbpMetric, number> => ({ views: 0, calls: 0, website: 0, directions: 0 });
  const totals = zero();
  const previous = zero();
  const daily = new Map<string, number>();
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) daily.set(d.toISOString().slice(0, 10), 0);
  const groups = (json as { multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: RawSeries[] }[] })?.multiDailyMetricTimeSeries ?? [];
  for (const g of groups)
    for (const s of g.dailyMetricTimeSeries ?? []) {
      const m = METRICS[s.dailyMetric ?? ""];
      if (!m) continue;
      for (const v of s.timeSeries?.datedValues ?? []) {
        if (!v.date) continue;
        const day = iso(v.date);
        const n = Number(v.value ?? 0) || 0;
        if (day >= from && day <= to) {
          totals[m] += n;
          if (m === "views") daily.set(day, (daily.get(day) ?? 0) + n);
        } else if (day >= prevFrom && day < from) previous[m] += n;
      }
    }
  return { from, to, totals, previous, daily: [...daily.entries()] };
}

/** Words Google uses when the project isn't approved for the Business Profile APIs yet. */
export function friendlyGoogleError(status: number, json: unknown): string {
  const e = (json as { error?: { message?: string; status?: string; details?: { reason?: string }[] } })?.error;
  const msg = e?.message ?? "";
  const reasons = (e?.details ?? []).map((d) => d.reason ?? "").join(" ");
  // A project Google hasn't approved for these APIs has a quota of 0, so every call is a 429.
  if (status === 429 || /quota/i.test(msg))
    return "Google refused the request for quota. If it happens every time, Google hasn't approved this app for Business Profile access yet.";
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(msg + reasons))
    return "The Business Profile API isn't switched on for this app's Google project yet.";
  if (status === 403) return "Google says this login can't manage that listing. Sign in with the Google account that owns or manages it.";
  if (status === 401) return "Google sign-in has expired. Sign in with Google again.";
  if (status === 404) return "Google couldn't find that listing any more.";
  return msg ? `Google: ${msg}` : `Google request failed (${status}).`;
}

/** Folded for comparing names: lower case, letters and spaces only. */
export const foldName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The client a reviewer probably is: same full name (at least two words), and only one client
 * with that name. null when unsure.
 */
export function matchClient(reviewer: string, clients: { id: number; name: string }[]): number | null {
  const r = foldName(reviewer);
  if (r.split(" ").length < 2) return null;
  const hits = clients.filter((c) => foldName(c.name) === r);
  return hits.length === 1 ? hits[0].id : null;
}

/** Suggested replies, by how the review went. */
export function replyTemplates(o: { stars: number; firstName: string; business: string }): string[] {
  // "Hi Sarah, thank you…" or, with no name, "Thank you…".
  const hi = (rest: string) => (o.firstName ? `Hi ${o.firstName}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));
  const sign = o.business ? `\n\n${o.business}` : "";
  if (o.stars >= 4)
    return [
      `${hi(`thank you so much for the ${o.stars}-star review! It was a pleasure working with you, and we're glad you're happy with the job.`)}${sign}`,
      `${hi(`thanks for taking the time to leave a review. We really appreciate your support and look forward to helping again.`)}${sign}`,
    ];
  if (o.stars === 3)
    return [`${hi(`thanks for your feedback. We'd love to hear how we could have done better. Please give us a call so we can make it right.`)}${sign}`];
  return [
    `${hi(`we're sorry to hear about your experience. This isn't the standard we aim for. Please contact us directly so we can understand what happened and put it right.`)}${sign}`,
  ];
}
