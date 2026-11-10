import { db } from "./db";
import { env } from "./serverEnv";

// Server-only. Push notifications to the Android app through Firebase Cloud Messaging (HTTP v1).
// Secret FCM_SERVICE_ACCOUNT holds the Firebase service account JSON. Sending is best-effort:
// nothing here throws into the caller, and tokens Firebase reports as gone are removed.

export type PushKind = "leads" | "quotes" | "payments" | "jobs";
export type PushPrefs = Record<PushKind, boolean>;
export const PUSH_KINDS: PushKind[] = ["leads", "quotes", "payments", "jobs"];

export type PushMessage = { title: string; body: string; /** In-app path opened on tap, e.g. /jobs/12 */ url?: string };

/** Missing or malformed prefs mean "on". */
export function readPushPrefs(raw: unknown): PushPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(PUSH_KINDS.map((k) => [k, o[k] !== false])) as PushPrefs;
}

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

export function readServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    return sa.client_email && sa.private_key && sa.project_id ? (sa as ServiceAccount) : null;
  } catch {
    return null;
  }
}

export const isPushConfigured = () => !!readServiceAccount(env("FCM_SERVICE_ACCOUNT"));

/** The FCM v1 message for one device. */
export function fcmMessage(token: string, m: PushMessage) {
  return {
    message: {
      token,
      notification: { title: m.title.slice(0, 120), body: m.body.slice(0, 400) },
      data: { url: m.url ?? "/" },
      android: {
        priority: "high",
        notification: { channel_id: "alerts", icon: "ic_stat_notify", color: "#0C6FD0", sound: "default" },
      },
    },
  };
}

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === "string" ? bytes : String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

let cached: { token: string; exp: number; email: string } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description || `Firebase sign-in failed (${res.status})`);
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600), email: sa.client_email };
  return j.access_token;
}

/** Sends to every device of these users. Returns how many devices accepted it. */
export async function pushToUsers(userIds: number[], m: PushMessage): Promise<{ sent: number; failed: number; error?: string }> {
  const sa = readServiceAccount(env("FCM_SERVICE_ACCOUNT"));
  if (!sa || !userIds.length) return { sent: 0, failed: 0, error: sa ? undefined : "Push notifications aren't set up yet." };
  const devices = await db.selectFrom("pushDevices").select(["id", "token"]).where("userId", "in", [...new Set(userIds)]).execute();
  if (!devices.length) return { sent: 0, failed: 0 };
  let token: string;
  try {
    token = await accessToken(sa);
  } catch (e) {
    return { sent: 0, failed: devices.length, error: e instanceof Error ? e.message : "Firebase sign-in failed" };
  }
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  const gone: number[] = [];
  await Promise.all(
    devices.map(async (d) => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(fcmMessage(d.token, m)),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          sent++;
          return;
        }
        failed++;
        const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
        lastError = body.error?.message || `Firebase returned ${res.status}`;
        // The app was uninstalled or the token rotated.
        if (res.status === 404 || body.error?.status === "NOT_FOUND" || body.error?.status === "UNREGISTERED") gone.push(d.id);
      } catch (e) {
        failed++;
        lastError = e instanceof Error ? e.message : "Couldn't reach Firebase";
      }
    }),
  );
  if (gone.length) await db.deleteFrom("pushDevices").where("id", "in", gone).execute().catch(() => undefined);
  return { sent, failed, error: lastError };
}

async function usersWanting(rows: { userId: number; pushPrefs: unknown }[], kind: PushKind) {
  return rows.filter((r) => readPushPrefs(r.pushPrefs)[kind]).map((r) => r.userId);
}

/** Owners and office admins of a business who want this kind of alert. Never throws. */
export async function pushOffice(businessId: number, kind: PushKind, m: PushMessage) {
  try {
    if (!isPushConfigured()) return;
    const rows = await db
      .selectFrom("memberships as m")
      .innerJoin("users as u", "u.id", "m.userId")
      .select(["u.id as userId", "u.pushPrefs"])
      .where("m.businessId", "=", businessId)
      .where("m.role", "in", ["owner", "admin"])
      .execute();
    await pushToUsers(await usersWanting(rows, kind), m);
  } catch {
    /* alerts are best-effort */
  }
}

/** The login linked to a crew member (staff row). Never throws. */
export async function pushStaff(businessId: number, staffId: number, kind: PushKind, m: PushMessage) {
  try {
    if (!isPushConfigured()) return;
    const rows = await db
      .selectFrom("memberships as m")
      .innerJoin("users as u", "u.id", "m.userId")
      .select(["u.id as userId", "u.pushPrefs"])
      .where("m.businessId", "=", businessId)
      .where("m.staffId", "=", staffId)
      .execute();
    await pushToUsers(await usersWanting(rows, kind), m);
  } catch {
    /* alerts are best-effort */
  }
}

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "Payment received" for a job that was just paid online. Never throws. */
export async function pushJobPaid(jobId: number, via: string) {
  try {
    if (!isPushConfigured()) return;
    const j = await db.selectFrom("jobs").select(["businessId", "num", "customer", "price"]).where("id", "=", jobId).executeTakeFirst();
    if (!j) return;
    await pushOffice(j.businessId, "payments", {
      title: `Payment received · ${money(Number(j.price) || 0)}`,
      body: `${j.customer} paid invoice ${j.num.replace(/^LC-/, "")}${via ? ` by ${via}` : ""}.`,
      url: `/jobs/${jobId}`,
    });
  } catch {
    /* best-effort */
  }
}

/** "New job for you" to the crew member a job was just assigned to. Never throws. */
export async function pushJobAssigned(jobId: number) {
  try {
    if (!isPushConfigured()) return;
    const j = await db
      .selectFrom("jobs")
      .select(["businessId", "staffId", "customer", "service", "address", "scheduledDate", "scheduledTime", "status"])
      .where("id", "=", jobId)
      .executeTakeFirst();
    if (!j?.staffId || j.status === "Cancelled") return;
    const when = j.scheduledDate
      ? new Date(j.scheduledDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) +
        (j.scheduledTime ? ` ${j.scheduledTime}` : "")
      : "";
    await pushStaff(j.businessId, j.staffId, "jobs", {
      title: `New job${when ? ` · ${when}` : ""}`,
      body: [j.service, j.customer, j.address].filter(Boolean).join(" · "),
      url: "/field",
    });
  } catch {
    /* best-effort */
  }
}
