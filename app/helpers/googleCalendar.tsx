import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { API_URL } from "./serverEnv";

// Server-only helpers for each business's Google Calendar link (OAuth 2.0 + PKCE).
// One linked calendar per business (gcal_connection keyed by business_id).

export const GCAL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
export const GCAL_CALLBACK_PATH = "/gcal/callback";
const STATE_TTL_MS = 15 * 60 * 1000;

// Prefer the dedicated Calendar OAuth client (GCAL_*); fall back to the shared LSP one.
function readCreds() {
  const env = process.env as unknown as Record<string, string | undefined>;
  const dedicated = env.GCAL_CLIENT_ID && env.GCAL_CLIENT_SECRET;
  return {
    clientId: dedicated ? env.GCAL_CLIENT_ID : env.GOOGLE_CLIENT_ID,
    clientSecret: dedicated ? env.GCAL_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET,
  };
}

export function gcalCredentials() {
  const { clientId, clientSecret } = readCreds();
  if (!clientId || !clientSecret) throw new Error("Google OAuth client isn't configured for this app yet.");
  return { clientId, clientSecret };
}

export function isGcalConfigured() {
  const { clientId, clientSecret } = readCreds();
  return !!clientId && !!clientSecret;
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function startGcalAuth(origin: string, businessId: number) {
  const { clientId } = gcalCredentials();
  const redirectUri = `${API_URL}${GCAL_CALLBACK_PATH}`;
  const state = b64url(randomBytes(24));
  const codeVerifier = b64url(randomBytes(48));
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());

  await db.deleteFrom("gcalOauthStates").where("createdAt", "<", new Date(Date.now() - STATE_TTL_MS)).execute();
  await db.insertInto("gcalOauthStates").values({ state, codeVerifier, redirectUri, businessId }).execute();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GCAL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return { authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirectUri };
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(json.error_description || json.error || `Google token request failed (${res.status})`);
  return json;
}

/** Completes the OAuth flow. The business comes from the stored state, not the popup's cookies. */
export async function finishGcalAuth(code: string, state: string) {
  const row = await db.deleteFrom("gcalOauthStates").where("state", "=", state).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - STATE_TTL_MS) throw new Error("This sign-in link has expired. Please try connecting again.");
  const businessId = row.businessId;
  const { clientId, clientSecret } = gcalCredentials();
  const tokens = await tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: row.redirectUri,
    grant_type: "authorization_code",
    code_verifier: row.codeVerifier,
  });
  if (!tokens.refresh_token) throw new Error("Google didn't return offline access. Please try connecting again.");
  const scopes = tokens.scope ?? "";
  if (!scopes.includes("calendar")) throw new Error("Calendar access wasn't granted. Please tick the Calendar permission when connecting.");

  const who = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const info = (await who.json()) as { email?: string };
  const email = info.email ?? "Google account";

  let timeZone = "Australia/Sydney";
  try {
    const cal = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (cal.ok) timeZone = ((await cal.json()) as { timeZone?: string }).timeZone || timeZone;
  } catch {
    /* keep default */
  }

  // A different Google account means old event links point at someone else's calendar.
  const prev = await db.selectFrom("gcalConnection").select("email").where("businessId", "=", businessId).executeTakeFirst();
  if (prev && prev.email !== email) {
    await db.updateTable("jobs").set({ gcalEventId: null }).where("businessId", "=", businessId).where("gcalEventId", "is not", null).execute();
  }

  const values = {
    email,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    accessExpiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
    scopes,
    timeZone,
    lastSyncError: null,
    connectedAt: new Date(),
  };
  await db
    .insertInto("gcalConnection")
    .values({ businessId, ...values })
    .onConflict((oc) => oc.column("businessId").doUpdateSet(values))
    .execute();
  return { email, businessId };
}

/** Valid access token for a business's calendar, refreshing when needed. */
export async function getGcalAccessToken(businessId: number) {
  const conn = await db.selectFrom("gcalConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) throw new Error("Google Calendar isn't connected.");
  if (conn.accessToken && conn.accessExpiresAt && conn.accessExpiresAt.getTime() > Date.now()) return conn.accessToken;
  const { clientId, clientSecret } = gcalCredentials();
  const t = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: conn.refreshToken,
    grant_type: "refresh_token",
  });
  await db
    .updateTable("gcalConnection")
    .set({ accessToken: t.access_token, accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000) })
    .where("businessId", "=", businessId)
    .execute();
  return t.access_token;
}

export async function disconnectGcal(businessId: number) {
  const conn = await db.deleteFrom("gcalConnection").where("businessId", "=", businessId).returning(["refreshToken"]).executeTakeFirst();
  // Events already in the calendar stay there; we just stop tracking them.
  await db.updateTable("jobs").set({ gcalEventId: null }).where("businessId", "=", businessId).where("gcalEventId", "is not", null).execute();
  if (conn) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refreshToken)}`, { method: "POST" }).catch(() => undefined);
  }
}
