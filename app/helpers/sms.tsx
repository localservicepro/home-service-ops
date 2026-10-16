import { randomBytes } from "node:crypto";
import { db } from "./db";
import { API_URL, env } from "./serverEnv";
import { toE164 } from "./phone";

export { toE164 };

// Server-only. Text messages through each business's own myCRMSIM account (their SIM / phone).
// A business connects with OAuth (install → code → tokens), picks the workspace to send from,
// and chooses which messages go by SMS. Sending never blocks the app: callers get a result.

// MYCRMSIM_API_URL only for local testing against a stand-in gateway.
const API = (env("MYCRMSIM_API_URL") ?? "https://backend.mysmsgateway.app/api/v1").replace(/\/+$/, "");
const INSTALL = "https://app.mycrmsim.com/integrations/install";
export const SMS_CALLBACK_PATH = "/sms/callback";
const PENDING_TTL_MS = 60 * 60 * 1000;

export type SmsPrefs = {
  /** Quote and invoice send screens start on this. */
  docsDefault: "email" | "sms" | "both";
  /** Google review requests. */
  reviews: "email" | "sms" | "both";
  /** Text the owner about new enquiries and quote replies. */
  ownerAlerts: boolean;
  ownerPhone: string;
};
export const DEFAULT_PREFS: SmsPrefs = { docsDefault: "both", reviews: "email", ownerAlerts: false, ownerPhone: "" };

export function readPrefs(v: unknown): SmsPrefs {
  const o = v && typeof v === "object" ? (v as Partial<SmsPrefs>) : {};
  const ch = (x: unknown, d: SmsPrefs["docsDefault"]) => (x === "email" || x === "sms" || x === "both" ? x : d);
  return {
    docsDefault: ch(o.docsDefault, DEFAULT_PREFS.docsDefault),
    reviews: ch(o.reviews, DEFAULT_PREFS.reviews),
    ownerAlerts: o.ownerAlerts === true,
    ownerPhone: typeof o.ownerPhone === "string" ? o.ownerPhone : "",
  };
}

function creds() {
  return { clientId: env("MYCRMSIM_CLIENT_ID")?.trim(), clientSecret: env("MYCRMSIM_CLIENT_SECRET")?.trim() };
}
export const isSmsConfigured = () => {
  const c = creds();
  return !!c.clientId && !!c.clientSecret;
};
function requireCreds() {
  const c = creds();
  if (!c.clientId || !c.clientSecret) throw new Error("The SMS Gateway isn't set up for this app yet.");
  return { clientId: c.clientId, clientSecret: c.clientSecret };
}
const redirectUri = () => `${API_URL}${SMS_CALLBACK_PATH}`;

// ---------- connect ----------

export function smsInstallUrl() {
  const { clientId } = requireCreds();
  const q = new URLSearchParams({ redirect_uri: redirectUri() });
  return `${INSTALL}/${encodeURIComponent(clientId)}?${q}`;
}

type TokenData = { access_token?: string; refresh_token?: string; expires_in?: number; scopes?: string[] };

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${API}/third_party_integrations/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error("Couldn't reach SMS Gateway. Please try again in a moment.");
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: TokenData };
  const d = json.data ?? {};
  if (!res.ok || !d.access_token || !d.refresh_token) throw new Error(json.message || `SMS Gateway sign-in failed (${res.status})`);
  return { accessToken: d.access_token, refreshToken: d.refresh_token, accessExpiresAt: expiry(d.expires_in ?? 86_400), scopes: (d.scopes ?? []).join(" ") };
}
const expiry = (secs: number) => new Date(Date.now() + Math.max(60, secs - 300) * 1000);

/** Exchanges the install code and holds the tokens until the app links them to a business. */
export async function stashSmsInstall(code: string) {
  if (!/^[A-Za-z0-9]{8,128}$/.test(code)) throw new Error("The SMS Gateway response was incomplete. Please try connecting again.");
  const { clientId, clientSecret } = requireCreds();
  const t = await tokenRequest({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri() });
  let installerName: string | null = null;
  let installerEmail: string | null = null;
  try {
    const me = await fetch(`${API}/integration/me`, { headers: { Authorization: `Bearer ${t.accessToken}`, Accept: "application/json" } });
    const j = (await me.json().catch(() => ({}))) as { data?: { user?: { name?: string; email?: string } } };
    installerName = j.data?.user?.name ?? null;
    installerEmail = j.data?.user?.email ?? null;
  } catch {
    /* cosmetic */
  }
  const id = randomBytes(24).toString("hex");
  await db.deleteFrom("smsPendingInstalls").where("createdAt", "<", new Date(Date.now() - PENDING_TTL_MS)).execute();
  await db.insertInto("smsPendingInstalls").values({ id, ...t, installerName, installerEmail }).execute();
  return { id, installerName };
}

export async function claimSmsInstall(id: string, businessId: number) {
  const row = await db.deleteFrom("smsPendingInstalls").where("id", "=", id).returningAll().executeTakeFirst();
  if (!row || row.createdAt.getTime() < Date.now() - PENDING_TTL_MS) throw new Error("This connection has expired. Click Connect SMS Gateway again.");
  const values = {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accessExpiresAt: row.accessExpiresAt,
    scopes: row.scopes,
    installerName: row.installerName,
    installerEmail: row.installerEmail,
    lastError: null,
    connectedAt: new Date(),
  };
  await db
    .insertInto("smsConnection")
    .values({ businessId, ...values })
    .onConflict((oc) => oc.column("businessId").doUpdateSet(values))
    .execute();
  // One workspace? Pick it straight away.
  const ws = await listWorkspaces(businessId).catch(() => []);
  if (ws.length === 1) await db.updateTable("smsConnection").set({ workspaceId: String(ws[0].id), workspaceName: ws[0].name }).where("businessId", "=", businessId).execute();
  return { installerName: row.installerName, workspaces: ws.length };
}

export async function disconnectSms(businessId: number) {
  await db.deleteFrom("smsConnection").where("businessId", "=", businessId).execute();
}

/** Valid access token; refresh tokens rotate, so refresh under a row lock. */
async function access(businessId: number) {
  return db.transaction().execute(async (trx) => {
    const c = await trx.selectFrom("smsConnection").selectAll().where("businessId", "=", businessId).forUpdate().executeTakeFirst();
    if (!c) throw new Error("SMS Gateway isn't connected.");
    if (c.accessExpiresAt.getTime() > Date.now()) return { token: c.accessToken, conn: c };
    const { clientId, clientSecret } = requireCreds();
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refreshToken, client_id: clientId, client_secret: clientSecret });
    await trx.updateTable("smsConnection").set(t).where("businessId", "=", businessId).execute();
    return { token: t.accessToken, conn: { ...c, ...t } };
  });
}

export async function smsApi<T>(businessId: number, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token } = await access(businessId);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Couldn't reach SMS Gateway. Please try again in a moment.");
  }
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string } & T;
  if (!res.ok || json.success === false) {
    const msg = json.message || `SMS Gateway error ${res.status}`;
    if (res.status === 429) throw new Error("The SMS Gateway's send limit was reached (30 texts per 15 minutes). Try again shortly.");
    if (res.status === 403) throw new Error(`${msg} Reconnect SMS Gateway to grant access.`);
    throw new Error(msg);
  }
  return json;
}

export type Workspace = { id: number; name: string };
export async function listWorkspaces(businessId: number): Promise<Workspace[]> {
  const r = await smsApi<{ data?: { id: number; name?: string; meta?: { name?: string }; deleted_at?: string | null }[] }>(businessId, "/mycrmsim/workspaces?limit=200");
  return (r.data ?? []).filter((w) => !w.deleted_at).map((w) => ({ id: w.id, name: w.name || w.meta?.name || `Workspace ${w.id}` }));
}

export type Device = { id: number; channel: string; name: string; health: string; number: string | null; workspaceId: number | null };
export async function listDevices(businessId: number): Promise<Device[]> {
  const r = await smsApi<{ data?: { id: number; channel?: string; name?: string; health_status?: string; status?: string; number?: string; workspace_id?: number | null }[] }>(
    businessId,
    "/mycrmsim/devices",
  );
  return (r.data ?? []).map((d) => ({
    id: d.id,
    channel: d.channel ?? "",
    name: d.name ?? "",
    health: d.health_status ?? d.status ?? "unknown",
    number: d.number ?? null,
    workspaceId: d.workspace_id ?? null,
  }));
}

// ---------- send ----------

export type SmsKind = "quote" | "invoice" | "review" | "owner_alert" | "invite" | "test" | "reply";
export type SmsResult = { ok: true; to: string; messageId: string | null } | { ok: false; error: string };

/** Sends one text from the business's chosen workspace and logs it. Never throws. */
export async function sendSms(
  businessId: number,
  opts: { to: string; message: string; kind: SmsKind; jobId?: number; quoteId?: number },
): Promise<SmsResult> {
  const to = toE164(opts.to);
  if (!to) return { ok: false, error: "That doesn't look like a mobile number." };
  const conn = await db.selectFrom("smsConnection").select(["workspaceId"]).where("businessId", "=", businessId).executeTakeFirst();
  if (!conn) return { ok: false, error: "Connect SMS Gateway in Settings → Integrations to send texts." };
  if (!conn.workspaceId) return { ok: false, error: "Choose the SMS Gateway workspace to send from in Settings → Integrations." };
  const log = { businessId, kind: opts.kind, toPhone: to, jobId: opts.jobId ?? null, quoteId: opts.quoteId ?? null };
  try {
    const r = await smsApi<{ data?: { message_id?: string; status?: string } }>(businessId, "/mycrmsim/messages", {
      method: "POST",
      body: { workspace_id: Number(conn.workspaceId), phone: to, channel: "default", message: opts.message.slice(0, 1500) },
    });
    const status = r.data?.status ?? "queued";
    if (status === "failed") throw new Error("SMS Gateway couldn't queue the text. Check a phone is assigned to the workspace.");
    await db.insertInto("smsLog").values({ ...log, messageId: r.data?.message_id ?? null, status }).execute();
    await db.updateTable("smsConnection").set({ lastSentAt: new Date(), lastError: null }).where("businessId", "=", businessId).execute();
    return { ok: true, to, messageId: r.data?.message_id ?? null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insertInto("smsLog").values({ ...log, status: "failed", error: error.slice(0, 500) }).execute().catch(() => undefined);
    await db.updateTable("smsConnection").set({ lastError: error.slice(0, 500) }).where("businessId", "=", businessId).execute().catch(() => undefined);
    return { ok: false, error };
  }
}

/** Whether texts can go out for this business, and its preferences. */
export async function smsState(businessId: number) {
  const c = await db.selectFrom("smsConnection").select(["workspaceId", "prefs"]).where("businessId", "=", businessId).executeTakeFirst();
  return { ready: !!c?.workspaceId && isSmsConfigured(), prefs: readPrefs(c?.prefs) };
}

/** Text the owner (new enquiry, quote reply) when they've turned it on. Never throws. */
export async function smsOwner(businessId: number, message: string) {
  try {
    const s = await smsState(businessId);
    if (!s.ready || !s.prefs.ownerAlerts || !s.prefs.ownerPhone) return;
    await sendSms(businessId, { to: s.prefs.ownerPhone, message, kind: "owner_alert" });
  } catch {
    /* alerts are best-effort */
  }
}
