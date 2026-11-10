import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { API_URL } from "./serverEnv";
import { pushOffice } from "./push";
import {
  INSIGHT_METRICS,
  friendlyGoogleError,
  matchClient,
  parseInsights,
  parseLocations,
  parseReviews,
  type GbpInsights,
  type GbpLocation,
} from "./gbpParse";

// Server-only: Google Business Profile through the owner's own Google sign-in (OAuth 2.0 + PKCE,
// scope business.manage). The listing comes from their account, not a search, and the app can read
// every review, reply, see the profile's performance and post updates.
//
// Credentials: GBP_CLIENT_ID / GBP_CLIENT_SECRET, else the Calendar client (GCAL_*), else the shared
// GOOGLE_* one. The redirect URI API_URL/gbp/callback must be added to that OAuth client. Google
// also has to approve the project for the Business Profile APIs (until then their quota is 0).

export const GBP_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
export const GBP_CALLBACK_PATH = "/gbp/callback";
const STATE_TTL_MS = 15 * 60 * 1000;
const REVIEW_SYNC_MS = 30 * 60_000;
const INSIGHTS_TTL_MS = 6 * 3600_000;

const E = () => process.env as unknown as Record<string, string | undefined>;
function readCreds() {
  const env = E();
  if (env.GBP_CLIENT_ID && env.GBP_CLIENT_SECRET) return { clientId: env.GBP_CLIENT_ID, clientSecret: env.GBP_CLIENT_SECRET };
  if (env.GCAL_CLIENT_ID && env.GCAL_CLIENT_SECRET) return { clientId: env.GCAL_CLIENT_ID, clientSecret: env.GCAL_CLIENT_SECRET };
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}
export const isGbpGoogleConfigured = () => {
  const c = readCreds();
  return !!c.clientId && !!c.clientSecret;
};
function creds() {
  const c = readCreds();
  if (!c.clientId || !c.clientSecret) throw new Error("Google sign-in isn't set up for this app yet.");
  return c as { clientId: string; clientSecret: string };
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function startGbpAuth(businessId: number) {
  const { clientId } = creds();
  const redirectUri = `${API_URL}${GBP_CALLBACK_PATH}`;
  const state = b64url(randomBytes(24));
  const codeVerifier = b64url(randomBytes(48));
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());
  await db.deleteFrom("gbpOauthStates").where("createdAt", "<", new Date(Date.now() - STATE_TTL_MS)).execute();
  await db.insertInto("gbpOauthStates").values({ state, codeVerifier, redirectUri, businessId }).execute();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GBP_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return { authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    const err = new Error(json.error_description || json.error || `Google sign-in failed (${res.status})`);
    (err as Error & { code?: string }).code = json.error;
    throw err;
  }
  return json;
}

/** Completes sign-in. Picks the listing straight away when the account manages exactly one. */
export async function finishGbpAuth(code: string, state: string) {
  const row = await db.deleteFrom("gbpOauthStates").where("state", "=", state).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - STATE_TTL_MS) throw new Error("This sign-in link has expired. Please try again.");
  const businessId = row.businessId;
  const { clientId, clientSecret } = creds();
  const t = await tokenRequest({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: row.redirectUri, grant_type: "authorization_code", code_verifier: row.codeVerifier });
  if (!t.refresh_token) throw new Error("Google didn't give lasting access. Please try again.");
  if (!(t.scope ?? "").includes("business.manage")) throw new Error("Business Profile access wasn't granted. Tick the permission to manage your Business Profile when signing in.");
  const who = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } }).catch(() => null);
  const email = ((await who?.json().catch(() => ({}))) as { email?: string })?.email ?? "Google account";
  const values = { email, refreshToken: t.refresh_token, accessToken: t.access_token, accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), scopes: t.scope ?? "", connectedAt: new Date() };
  await db
    .insertInto("gbpGoogleAuth")
    .values({ businessId, ...values })
    .onConflict((oc) => oc.column("businessId").doUpdateSet(values))
    .execute();

  const locations = await listGbpLocations(businessId);
  const usable = locations.filter((l) => l.verified);
  if (usable.length === 1 || (locations.length === 1 && !usable.length)) {
    const loc = usable[0] ?? locations[0];
    await connectGbpLocation(businessId, loc.name, locations);
    return { businessId, email, connected: loc.title, choices: 0 };
  }
  return { businessId, email, connected: null as string | null, choices: locations.length };
}

class GoogleAuthGone extends Error {}

async function accessToken(businessId: number) {
  const a = await db.selectFrom("gbpGoogleAuth").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!a) throw new Error("Sign in with Google first.");
  if (a.accessToken && a.accessExpiresAt && new Date(a.accessExpiresAt).getTime() > Date.now() + 30_000) return a.accessToken;
  const { clientId, clientSecret } = creds();
  try {
    const t = await tokenRequest({ client_id: clientId, client_secret: clientSecret, refresh_token: a.refreshToken, grant_type: "refresh_token" });
    await db
      .updateTable("gbpGoogleAuth")
      .set({ accessToken: t.access_token, accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000) })
      .where("businessId", "=", businessId)
      .execute();
    return t.access_token;
  } catch (e) {
    if ((e as Error & { code?: string }).code === "invalid_grant") {
      // Access was removed in the Google account: forget it, so the card asks to sign in again.
      await db.deleteFrom("gbpGoogleAuth").where("businessId", "=", businessId).execute();
      await db.updateTable("gbpConnection").set({ lastSyncError: "Google access was removed. Sign in with Google again." }).where("businessId", "=", businessId).execute();
      throw new GoogleAuthGone("Google access was removed. Sign in with Google again.");
    }
    throw e;
  }
}

async function g<T>(businessId: number, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken(businessId);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) throw new Error("Google didn't answer. Try again in a minute.");
  if (res.status === 204) return {} as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyGoogleError(res.status, json));
  return json as T;
}

const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";
const PERF = "https://businessprofileperformance.googleapis.com/v1";
const READ_MASK = "name,title,storefrontAddress,metadata,websiteUri,phoneNumbers";

/** Every listing the signed-in Google account can manage. */
export async function listGbpLocations(businessId: number): Promise<GbpLocation[]> {
  const out: GbpLocation[] = [];
  let pageToken = "";
  const accounts: { name: string; accountName?: string }[] = [];
  do {
    const r = await g<{ accounts?: { name: string; accountName?: string }[]; nextPageToken?: string }>(businessId, `${ACCOUNTS}?pageSize=20${pageToken ? `&pageToken=${pageToken}` : ""}`);
    accounts.push(...(r.accounts ?? []));
    pageToken = r.nextPageToken ?? "";
  } while (pageToken && accounts.length < 100);
  for (const a of accounts) {
    let next = "";
    do {
      const r = await g<{ locations?: unknown[]; nextPageToken?: string }>(businessId, `${INFO}/${a.name}/locations?pageSize=100&readMask=${READ_MASK}${next ? `&pageToken=${next}` : ""}`);
      out.push(...parseLocations(a, r));
      next = r.nextPageToken ?? "";
    } while (next && out.length < 500);
  }
  return out;
}

export async function connectGbpLocation(businessId: number, locationName: string, known?: GbpLocation[]) {
  const all = known ?? (await listGbpLocations(businessId));
  const loc = all.find((l) => l.name === locationName);
  if (!loc) throw new Error("That listing isn't in your Google account.");
  const row = {
    source: "google",
    accountName: loc.account,
    locationName: loc.name,
    placeId: loc.placeId ?? loc.name,
    name: loc.title,
    address: loc.address,
    mapsUrl: loc.mapsUrl,
    reviewUrl: loc.reviewUrl,
    phone: loc.phone,
    website: loc.website,
    refreshedAt: new Date(),
    lastSyncError: null,
    insights: null,
    insightsAt: null,
  };
  const prev = await db.selectFrom("gbpConnection").select("locationName").where("businessId", "=", businessId).executeTakeFirst();
  if (prev?.locationName !== loc.name) await db.deleteFrom("gbpReviews").where("businessId", "=", businessId).execute();
  await db
    .insertInto("gbpConnection")
    .values({ businessId, ...row, connectedAt: new Date() })
    .onConflict((oc) => oc.column("businessId").doUpdateSet({ ...row, connectedAt: new Date() }))
    .execute();
  await syncGbpReviews(businessId).catch(() => undefined);
  return loc;
}

async function googleConn(businessId: number) {
  const c = await db.selectFrom("gbpConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!c || c.source !== "google" || !c.accountName || !c.locationName) throw new Error("Sign in with Google and pick your listing first.");
  return c as typeof c & { accountName: string; locationName: string };
}
const v4Location = (c: { accountName: string; locationName: string }) => `${V4}/${c.accountName}/${c.locationName}`;

/**
 * Reads reviews from Google into gbp_reviews: everything the first time (up to 1,000), then the
 * newest until it reaches ones already known. New reviews after the first read alert the office.
 */
export async function syncGbpReviews(businessId: number) {
  const c = await googleConn(businessId);
  const first = !c.lastSyncAt;
  const known = new Map((await db.selectFrom("gbpReviews").select(["reviewId", "updatedAt"]).where("businessId", "=", businessId).execute()).map((r) => [r.reviewId, new Date(r.updatedAt).getTime()]));
  const clients = await db.selectFrom("clients").select(["id", "name"]).where("businessId", "=", businessId).execute();
  let token = "";
  let pages = 0;
  let average: number | null = null;
  let total: number | null = null;
  const fresh: { name: string; stars: number }[] = [];
  try {
    do {
      const r = parseReviews(await g(businessId, `${v4Location(c)}/reviews?pageSize=50&orderBy=updateTime%20desc${token ? `&pageToken=${token}` : ""}`));
      average ??= r.average;
      total ??= r.total;
      let reachedKnown = false;
      for (const rv of r.reviews) {
        const seen = known.get(rv.reviewId);
        if (seen !== undefined && seen >= rv.updatedAt.getTime()) {
          reachedKnown = true;
          continue;
        }
        if (seen === undefined) fresh.push({ name: rv.reviewerName, stars: rv.stars });
        const v = { ...rv, clientId: matchClient(rv.reviewerName, clients) };
        await db
          .insertInto("gbpReviews")
          .values({ businessId, ...v })
          .onConflict((oc) => oc.columns(["businessId", "reviewId"]).doUpdateSet({ stars: v.stars, comment: v.comment, reviewerName: v.reviewerName, reviewerPhoto: v.reviewerPhoto, updatedAt: v.updatedAt, reply: v.reply, repliedAt: v.repliedAt, clientId: v.clientId }))
          .execute();
      }
      token = r.next ?? "";
      pages++;
      // Sorted newest-updated first: once a page holds reviews we already have, the rest are known.
      if (!first && reachedKnown) break;
    } while (token && pages < 20);
    await db
      .updateTable("gbpConnection")
      .set({
        lastSyncAt: new Date(),
        lastSyncError: null,
        refreshedAt: new Date(),
        ...(average != null ? { rating: String(Math.round(average * 10) / 10) } : {}),
        ...(total != null ? { reviewCount: total } : {}),
      })
      .where("businessId", "=", businessId)
      .execute();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't read reviews from Google.";
    await db.updateTable("gbpConnection").set({ lastSyncError: msg, lastSyncAt: new Date() }).where("businessId", "=", businessId).execute();
    throw e;
  }
  if (!first && fresh.length) {
    const one = fresh[0];
    await pushOffice(businessId, "reviews", {
      title: fresh.length === 1 ? `New ${one.stars}-star Google review` : `${fresh.length} new Google reviews`,
      body: fresh.length === 1 ? `${one.name} left a review. Tap to read and reply.` : "Tap to read and reply.",
      url: "/reviews",
    });
  }
  return { added: fresh.length };
}

export async function replyToReview(businessId: number, reviewId: string, comment: string) {
  const c = await googleConn(businessId);
  const r = await g<{ comment?: string; updateTime?: string }>(businessId, `${v4Location(c)}/reviews/${encodeURIComponent(reviewId)}/reply`, { method: "PUT", body: { comment } });
  await db
    .updateTable("gbpReviews")
    .set({ reply: r.comment ?? comment, repliedAt: r.updateTime ? new Date(r.updateTime) : new Date() })
    .where("businessId", "=", businessId)
    .where("reviewId", "=", reviewId)
    .execute();
}

export async function deleteReviewReply(businessId: number, reviewId: string) {
  const c = await googleConn(businessId);
  await g(businessId, `${v4Location(c)}/reviews/${encodeURIComponent(reviewId)}/reply`, { method: "DELETE" });
  await db.updateTable("gbpReviews").set({ reply: null, repliedAt: null }).where("businessId", "=", businessId).where("reviewId", "=", reviewId).execute();
}

const dayParts = (iso: string, key: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${key}.year=${y}&${key}.month=${m}&${key}.day=${d}`;
};

/** Views, calls, website clicks and directions for the last 30 days and the 30 before. Cached for 6 hours. */
export async function gbpInsights(businessId: number, refresh = false): Promise<GbpInsights> {
  const c = await googleConn(businessId);
  if (!refresh && c.insights && c.insightsAt && Date.now() - new Date(c.insightsAt).getTime() < INSIGHTS_TTL_MS) return c.insights as unknown as GbpInsights;
  const day = (offset: number) => new Date(Date.now() + 10 * 3_600_000 - offset * 86_400_000).toISOString().slice(0, 10);
  const to = day(2);
  const from = day(31);
  const prevFrom = day(61);
  const q = INSIGHT_METRICS.map((m) => `dailyMetrics=${m}`).join("&");
  const json = await g(businessId, `${PERF}/${c.locationName}:fetchMultiDailyMetricsTimeSeries?${q}&${dayParts(prevFrom, "dailyRange.startDate")}&${dayParts(to, "dailyRange.endDate")}`);
  const ins = parseInsights(json, from, to, prevFrom);
  await db.updateTable("gbpConnection").set({ insights: JSON.stringify(ins), insightsAt: new Date() }).where("businessId", "=", businessId).execute();
  return ins;
}

export type GbpPost = { name: string; summary: string; createdAt: string; url: string | null; state: string };

export async function listGbpPosts(businessId: number): Promise<GbpPost[]> {
  const c = await googleConn(businessId);
  const r = await g<{ localPosts?: { name: string; summary?: string; createTime?: string; searchUrl?: string; state?: string }[] }>(businessId, `${v4Location(c)}/localPosts?pageSize=10`);
  return (r.localPosts ?? []).map((p) => ({ name: p.name, summary: p.summary ?? "", createdAt: p.createTime ?? "", url: p.searchUrl ?? null, state: p.state ?? "" }));
}

export async function createGbpPost(businessId: number, p: { summary: string; action?: "BOOK" | "CALL" | "LEARN_MORE" | null; url?: string | null }) {
  const c = await googleConn(businessId);
  const body: Record<string, unknown> = { languageCode: "en-AU", summary: p.summary, topicType: "STANDARD" };
  if (p.action === "CALL") body.callToAction = { actionType: "CALL" };
  else if (p.action && p.url) body.callToAction = { actionType: p.action, url: p.url };
  await g(businessId, `${v4Location(c)}/localPosts`, { method: "POST", body });
}

/** Forgets the Google sign-in (and asks Google to revoke it). Keeps nothing from the listing. */
export async function signOutGbpGoogle(businessId: number) {
  const a = await db.selectFrom("gbpGoogleAuth").select("refreshToken").where("businessId", "=", businessId).executeTakeFirst();
  if (a) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(a.refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  await db.deleteFrom("gbpGoogleAuth").where("businessId", "=", businessId).execute();
  await db.deleteFrom("gbpReviews").where("businessId", "=", businessId).execute();
}

/** Tick: keep reviews fresh for listings connected by sign-in (a few businesses per run). */
export async function syncDueGbpReviews(limit = 5) {
  const due = await db
    .selectFrom("gbpConnection")
    .innerJoin("gbpGoogleAuth", "gbpGoogleAuth.businessId", "gbpConnection.businessId")
    .select("gbpConnection.businessId")
    .where("gbpConnection.source", "=", "google")
    .where((eb) => eb.or([eb("gbpConnection.lastSyncAt", "is", null), eb("gbpConnection.lastSyncAt", "<", new Date(Date.now() - REVIEW_SYNC_MS))]))
    .orderBy("gbpConnection.lastSyncAt", "asc")
    .limit(limit)
    .execute();
  let synced = 0;
  for (const d of due) {
    try {
      await syncGbpReviews(d.businessId);
      synced++;
    } catch (e) {
      if (!(e instanceof GoogleAuthGone)) console.error("[gbp] review sync failed", d.businessId, e instanceof Error ? e.message : e);
    }
  }
  return synced;
}
