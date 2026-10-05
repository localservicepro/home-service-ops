import { randomBytes } from "node:crypto";
import { db } from "./db";
import { API_URL } from "./serverEnv";

// Server-only: OAuth link from each business to one LeadConnector sub-account (location).
// Uses LeadConnector domains only (marketplace.leadconnectorhq.com / services.leadconnectorhq.com).

export const LC_API = "https://services.leadconnectorhq.com";
export const LC_API_VERSION = "2021-07-28";
export const LC_CALLBACK_PATH = "/crm/callback";
export const LC_SCOPES = [
  "locations.readonly",
  "contacts.readonly",
  "contacts.write",
  "opportunities.readonly",
  "opportunities.write",
];
const AUTH_URL = "https://marketplace.leadconnectorhq.com/oauth/chooselocation";
const TOKEN_URL = `${LC_API}/oauth/token`;
const STATE_TTL_MS = 15 * 60 * 1000;

function creds() {
  const env = process.env as unknown as Record<string, string | undefined>;
  return { clientId: env.LC_CLIENT_ID, clientSecret: env.LC_CLIENT_SECRET };
}
export function isLcConfigured() {
  const c = creds();
  return !!c.clientId && !!c.clientSecret;
}
function requireCreds() {
  const c = creds();
  if (!c.clientId || !c.clientSecret) throw new Error("The LeadConnector app isn't configured for this app yet.");
  return { clientId: c.clientId, clientSecret: c.clientSecret };
}

export async function startLcAuth(origin: string, businessId: number) {
  const { clientId } = requireCreds();
  const redirectUri = `${API_URL}${LC_CALLBACK_PATH}`;
  const state = randomBytes(24).toString("hex");
  await db.deleteFrom("lcOauthStates").where("createdAt", "<", new Date(Date.now() - STATE_TTL_MS)).execute();
  await db.insertInto("lcOauthStates").values({ state, redirectUri, businessId }).execute();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: LC_SCOPES.join(" "),
    state,
  });
  return { authorizeUrl: `${AUTH_URL}?${params}` };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  userType?: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
  error?: string;
  error_description?: string;
  message?: string | string[];
};

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || (Array.isArray(json.message) ? json.message.join(", ") : json.message) || json.error;
    throw new Error(msg || `LeadConnector token request failed (${res.status})`);
  }
  return json as TokenResponse & { access_token: string; refresh_token: string; expires_in: number };
}

const expiry = (secs: number) => new Date(Date.now() + Math.max(60, secs - 120) * 1000);

export async function finishLcAuth(code: string, state: string) {
  const row = await db.deleteFrom("lcOauthStates").where("state", "=", state).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - STATE_TTL_MS) {
    throw new Error("This connection link has expired. Please try connecting again.");
  }
  const { clientId, clientSecret } = requireCreds();
  const t = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    user_type: "Location",
    redirect_uri: row.redirectUri,
  });
  if (!t.locationId) throw new Error("Please choose a single sub-account when connecting, not the whole agency.");
  if (!t.refresh_token) throw new Error("LeadConnector didn't return a refresh token. Please try again.");

  let locationName = "";
  try {
    const res = await fetch(`${LC_API}/locations/${encodeURIComponent(t.locationId)}`, {
      headers: { Authorization: `Bearer ${t.access_token}`, Version: LC_API_VERSION, Accept: "application/json" },
    });
    if (res.ok) locationName = ((await res.json()) as { location?: { name?: string } }).location?.name ?? "";
  } catch {
    /* name is cosmetic */
  }

  const values = {
    locationId: t.locationId,
    locationName,
    companyId: t.companyId ?? null,
    userId: t.userId ?? null,
    accessToken: t.access_token,
    accessExpiresAt: expiry(t.expires_in),
    refreshToken: t.refresh_token,
    scopes: t.scope ?? "",
    redirectUri: row.redirectUri,
    connectedAt: new Date(),
  };
  // Switching to a different sub-account: old opportunity links point at the other account.
  const prev = await db.selectFrom("lcConnection").select("locationId").where("businessId", "=", row.businessId).executeTakeFirst();
  const switched = !!prev && prev.locationId !== t.locationId;
  if (switched) {
    await db.deleteFrom("lcOpportunities").where("businessId", "=", row.businessId).execute();
    await db.updateTable("jobs").set({ lcOpportunityId: null, lcContactId: null }).where("businessId", "=", row.businessId).execute();
    await db.updateTable("quotes").set({ lcOpportunityId: null }).where("businessId", "=", row.businessId).execute();
    await db.updateTable("clients").set({ lcContactId: null }).where("businessId", "=", row.businessId).execute();
  }
  const reset = switched ? { pipelineId: null, stageMap: {}, importAfter: null, lastImportAt: null } : {};
  await db
    .insertInto("lcConnection")
    .values({ businessId: row.businessId, ...values })
    .onConflict((oc) => oc.column("businessId").doUpdateSet({ ...values, ...reset }))
    .execute();
  return { locationId: t.locationId, locationName };
}

/** Valid access token for a business's sub-account. Refresh tokens rotate, so refresh under a row lock. */
export async function getLcAccess(businessId: number) {
  return db.transaction().execute(async (trx) => {
    const c = await trx.selectFrom("lcConnection").selectAll().where("businessId", "=", businessId).forUpdate().executeTakeFirst();
    if (!c) throw new Error("LeadConnector isn't connected.");
    if (c.accessExpiresAt.getTime() > Date.now()) return { token: c.accessToken, locationId: c.locationId };
    const { clientId, clientSecret } = requireCreds();
    const t = await tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: c.refreshToken,
      user_type: "Location",
      redirect_uri: c.redirectUri,
    });
    await trx
      .updateTable("lcConnection")
      .set({
        accessToken: t.access_token,
        accessExpiresAt: expiry(t.expires_in),
        ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
      })
      .where("businessId", "=", businessId)
      .execute();
    return { token: t.access_token, locationId: c.locationId };
  });
}

/** Authenticated call to the LeadConnector API for a business's sub-account. */
export async function lcFetch(businessId: number, path: string, init: RequestInit = {}) {
  const { token } = await getLcAccess(businessId);
  return fetch(`${LC_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: LC_API_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function disconnectLc(businessId: number) {
  // Opportunity links are kept, so reconnecting the same sub-account carries on where it left off.
  await db.deleteFrom("lcConnection").where("businessId", "=", businessId).execute();
}
