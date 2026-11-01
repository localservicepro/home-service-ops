import { sql, type Transaction } from "kysely";
import { db } from "./db";
import type { DB, Json } from "./schema";
import { linkNewUser } from "./accountSetup";
import { queueAccountSync } from "./salesBrain";
import { setCancelAtPeriodEnd } from "./billing";
import { EmailNotConfiguredError, esc, layout, sendAppEmail } from "./mailer";
import { APP_URL, AUTH_URL, env } from "./serverEnv";
import { DEFAULT_COMP_NOTE, type ProvisionRequest } from "./salesBrainInbound";

// Server-only. Sales Brain gives a customer free access to the app (POST API/salesbrain/accounts):
// - grant: finds their account (by Sales Brain's id, then this app's id, then the owner's email) or
//   creates the login and business from the details sent, and turns on complimentary access.
// - revoke: turns it off again, leaving `grace_days` of full access to choose a plan.
// Every change queues account.upserted in the same transaction, so Sales Brain hears the result.
// Only access Sales Brain gave can be taken away by Sales Brain; staff-given access is left alone.

export type ProvisionResult = {
  httpStatus: number;
  body: {
    ok: boolean;
    error?: string;
    status?: "created" | "granted" | "unchanged" | "revoked";
    account_id?: string;
    email?: string;
    login?: "new" | "existing";
    email_sent?: boolean;
    trial_ends_at?: string | null;
    note?: string;
  };
};

const fail = (httpStatus: number, error: string): ProvisionResult => ({ httpStatus, body: { ok: false, error } });

type Biz = { id: number; comp: boolean; compSource: string | null; sbExternalId: string | null; trialEndsAt: Date | null };
const BIZ_COLS = ["id", "comp", "compSource", "sbExternalId", "trialEndsAt"] as const;

async function ownerEmail(exec: Transaction<DB> | typeof db, businessId: number) {
  const r = await exec
    .selectFrom("memberships")
    .innerJoin("users", "users.id", "memberships.userId")
    .select(["users.email", "users.displayName"])
    .where("memberships.businessId", "=", businessId)
    .where("memberships.role", "=", "owner")
    .orderBy("memberships.id")
    .executeTakeFirst();
  return r ?? null;
}

/** The business Sales Brain means: its own id first, then ours, then the owner's email. */
async function findBusiness(trx: Transaction<DB>, req: ProvisionRequest): Promise<{ biz: Biz | null; conflict?: string }> {
  const byExt = await trx.selectFrom("businesses").select(BIZ_COLS).where("sbExternalId", "=", req.external_id).executeTakeFirst();
  if (byExt) return { biz: byExt };
  if (req.account_id) {
    const byId = await trx.selectFrom("businesses").select(BIZ_COLS).where("id", "=", Number(req.account_id)).executeTakeFirst();
    if (!byId) return { biz: null, conflict: `No account ${req.account_id}` };
    if (byId.sbExternalId && byId.sbExternalId !== req.external_id) return { biz: null, conflict: `Account ${req.account_id} is linked to a different Sales Brain customer` };
    return { biz: byId };
  }
  if (req.email) {
    const m = await trx
      .selectFrom("users")
      .innerJoin("memberships", "memberships.userId", "users.id")
      .innerJoin("businesses", "businesses.id", "memberships.businessId")
      .select(["memberships.role", "businesses.id", "businesses.comp", "businesses.compSource", "businesses.sbExternalId", "businesses.trialEndsAt"])
      .where(sql<string>`lower(users.email)`, "=", req.email)
      .orderBy("memberships.id")
      .executeTakeFirst();
    if (m) {
      if (m.role !== "owner") return { biz: null, conflict: `${req.email} is a team member of another business, not an owner` };
      if (m.sbExternalId && m.sbExternalId !== req.external_id) return { biz: null, conflict: `${req.email}'s account is linked to a different Sales Brain customer` };
      const { role: _role, ...biz } = m;
      return { biz };
    }
  }
  return { biz: null };
}

type AuthRow = { id: string; confirmed: boolean };

async function findLogin(email: string): Promise<AuthRow | null> {
  const { rows } = await sql<AuthRow>`
    select au.id::text as id, au.email_confirmed_at is not null as confirmed
      from auth.users au where lower(au.email) = ${email} limit 1`.execute(db);
  return rows[0] ?? null;
}

async function authAdmin<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${AUTH_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { msg?: string; message?: string; error_description?: string };
  if (!res.ok) throw new Error(j.msg || j.message || j.error_description || `Supabase Auth answered ${res.status}`);
  return j;
}

/** A login for this email: the existing one, or a new one with no password (they set it from the welcome email or use Google). */
async function ensureLogin(email: string, displayName: string): Promise<{ authId: string; isNew: boolean }> {
  const found = await findLogin(email);
  if (found) {
    if (!found.confirmed) await authAdmin(`/admin/users/${found.id}`, "PUT", { email_confirm: true });
    return { authId: found.id, isNew: false };
  }
  const u = await authAdmin<{ id: string }>("/admin/users", "POST", {
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName, source: "salesbrain" },
  });
  return { authId: u.id, isNew: true };
}

/** One-hour link to choose a password (Supabase recovery link through our /reset page). */
async function passwordLink(email: string): Promise<string | null> {
  try {
    const link = await authAdmin<{ hashed_token?: string; properties?: { hashed_token?: string } }>("/admin/generate_link", "POST", {
      type: "recovery",
      email,
      redirect_to: `${APP_URL}/reset/recovery`,
    });
    const token = link.hashed_token ?? link.properties?.hashed_token;
    return token ? `${APP_URL}/reset/${token}` : null;
  } catch {
    return null;
  }
}

async function send(to: string, subject: string, heading: string, paragraphs: string[], cta?: { label: string; url: string }) {
  try {
    await sendAppEmail({
      to,
      fromName: "Local Service Pro",
      subject,
      html: layout({ brand: "Home Service Ops", heading, paragraphs: paragraphs.map(esc), cta }),
      text: [...paragraphs, ...(cta ? [`${cta.label}: ${cta.url}`] : [])].join("\n\n"),
    });
    return true;
  } catch (e) {
    if (!(e instanceof EmailNotConfiguredError)) console.error("[salesbrain] provision email failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Fills the empty business details from what Sales Brain sent. Never overwrites what the customer entered. */
async function fillDetails(trx: Transaction<DB>, businessId: number, req: ProvisionRequest) {
  const s = await trx.selectFrom("settings").select(["business", "owner"]).where("businessId", "=", businessId).executeTakeFirst();
  if (!s) return;
  const business = { ...((s.business ?? {}) as Record<string, string>) };
  const owner = { ...((s.owner ?? {}) as Record<string, string>) };
  const put = (o: Record<string, string>, k: string, v?: string) => {
    if (v && !o[k]?.trim()) o[k] = v;
  };
  put(business, "phone", req.phone);
  put(business, "address", req.address);
  put(business, "website", req.website);
  put(business, "abn", req.abn);
  put(owner, "phone", req.phone);
  await trx
    .updateTable("settings")
    .set({ business: business as unknown as Json, owner: owner as unknown as Json })
    .where("businessId", "=", businessId)
    .execute();
}

async function grant(req: ProvisionRequest): Promise<ProvisionResult> {
  const email = req.email!;
  const displayName = req.owner_name || email.split("@")[0];
  const note = req.note || DEFAULT_COMP_NOTE;

  // Look first without creating anything, so an existing customer never gets a stray login.
  const pre = await db.transaction().execute((trx) => findBusiness(trx, req));
  if (pre.conflict) return fail(409, pre.conflict);

  let login: { authId: string; isNew: boolean } | null = null;
  if (!pre.biz) login = await ensureLogin(email, displayName);

  const out = await db.transaction().execute(async (trx) => {
    // One provision at a time per customer (Sales Brain retries can overlap).
    await sql`select pg_advisory_xact_lock(hashtext(${`sb-provision:${req.external_id}`}))`.execute(trx);
    const found = await findBusiness(trx, req);
    if (found.conflict) return { error: found.conflict } as const;
    let biz = found.biz;
    let created = false;
    if (!biz) {
      const user = await trx
        .insertInto("users")
        .values({ authId: login!.authId, email, displayName })
        .onConflict((oc) => oc.column("authId").doUpdateSet({ email }))
        .returning(["id", "email", "displayName"])
        .executeTakeFirstOrThrow();
      const linked = await trx.selectFrom("memberships").select(["businessId", "role"]).where("userId", "=", user.id).executeTakeFirst();
      if (linked && linked.role !== "owner") return { error: `${email} is a team member of another business, not an owner` } as const;
      const businessId = linked ? linked.businessId : (await linkNewUser(trx, user, { businessName: req.business_name })).businessId;
      created = !linked;
      biz = (await trx.selectFrom("businesses").select(BIZ_COLS).where("id", "=", businessId).executeTakeFirstOrThrow()) as Biz;
    }
    if (biz.comp && biz.compSource !== "salesbrain") {
      // Staff already gave free access; just link the customer.
      await trx.updateTable("businesses").set({ sbExternalId: req.external_id }).where("id", "=", biz.id).execute();
      return { businessId: biz.id, status: "unchanged" as const, created };
    }
    const unchanged = biz.comp && biz.compSource === "salesbrain" && biz.sbExternalId === req.external_id;
    await trx
      .updateTable("businesses")
      .set({ comp: true, compSource: "salesbrain", compNote: note, sbExternalId: req.external_id, cancelledAt: null })
      .where("id", "=", biz.id)
      .execute();
    if (created) await fillDetails(trx, biz.id, req);
    await queueAccountSync(trx, biz.id);
    return { businessId: biz.id, status: created ? ("created" as const) : unchanged ? ("unchanged" as const) : ("granted" as const), created };
  });
  if ("error" in out) return fail(409, out.error ?? "Conflict");

  // A paying customer now gets it free: stop the subscription renewing (no refund; it runs to period end).
  let stoppedRenewal = false;
  const b = await db.selectFrom("businesses").select(["stripeSubscriptionId", "subscriptionStatus", "cancelAtPeriodEnd"]).where("id", "=", out.businessId).executeTakeFirstOrThrow();
  if (out.status !== "unchanged" && b.stripeSubscriptionId && !b.cancelAtPeriodEnd && ["active", "trialing", "past_due", "unpaid"].includes(b.subscriptionStatus ?? "")) {
    stoppedRenewal = await setCancelAtPeriodEnd(out.businessId, true, `Free access: ${note}`)
      .then(() => true)
      .catch((e) => {
        console.error("[salesbrain] couldn't stop renewal for", out.businessId, e instanceof Error ? e.message : e);
        return false;
      });
  }

  const owner = await ownerEmail(db, out.businessId);
  const to = owner?.email ?? email;
  let emailSent = false;
  if (req.send_email && out.status !== "unchanged") {
    const first = (owner?.displayName ?? displayName).split(" ")[0] || "there";
    if (out.created && login?.isNew) {
      const link = await passwordLink(to);
      emailSent = await send(
        to,
        "Your Home Service Ops account is ready",
        "Your account is ready",
        [
          `Hi ${first},`,
          `${note}: you have free access to Home Service Ops for ${req.business_name}. Quotes, jobs, invoices, your crew and your calendar, all in one app.`,
          `Choose a password to sign in with ${to}. The link works once and expires in 1 hour. After that, use "Forgot your password?" on the sign-in page, or "Continue with Google" with this email.`,
        ],
        { label: "Choose a password", url: link ?? `${APP_URL}/forgot` },
      );
    } else {
      emailSent = await send(
        to,
        "Free access to Home Service Ops",
        "You now have free access",
        [
          `Hi ${first},`,
          `${note}: your Home Service Ops account now has the Team plan at no cost.`,
          ...(stoppedRenewal ? ["Your paid subscription won't renew. You won't be charged again while this lasts."] : []),
        ],
        { label: "Open Home Service Ops", url: APP_URL },
      );
    }
  }

  return {
    httpStatus: out.created ? 201 : 200,
    body: {
      ok: true,
      status: out.status,
      account_id: String(out.businessId),
      email: to,
      login: login?.isNew ? "new" : "existing",
      email_sent: emailSent,
      ...(stoppedRenewal ? { note: "Their paid subscription was set not to renew." } : {}),
    },
  };
}

async function revoke(req: ProvisionRequest): Promise<ProvisionResult> {
  const out = await db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtext(${`sb-provision:${req.external_id}`}))`.execute(trx);
    const found = await findBusiness(trx, req);
    if (found.conflict) return { code: 409, error: found.conflict } as const;
    const biz = found.biz;
    if (!biz) return { code: 404, error: "No account matches this customer" } as const;
    if (biz.comp && biz.compSource !== "salesbrain") return { code: 409, error: "Free access on this account was given by Local Service Pro staff. Ask them to change it." } as const;
    if (!biz.comp) return { businessId: biz.id, status: "unchanged" as const, trialEndsAt: biz.trialEndsAt };
    const grace = req.grace_days > 0 ? new Date(Date.now() + req.grace_days * 86_400_000) : null;
    const trialEndsAt = grace && (!biz.trialEndsAt || biz.trialEndsAt < grace) ? grace : biz.trialEndsAt;
    await trx
      .updateTable("businesses")
      .set({ comp: false, compSource: null, compNote: null, sbExternalId: req.external_id, trialEndsAt })
      .where("id", "=", biz.id)
      .execute();
    await queueAccountSync(trx, biz.id);
    return { businessId: biz.id, status: "revoked" as const, trialEndsAt };
  });
  if ("error" in out) return fail(out.code ?? 409, out.error ?? "Conflict");

  let emailSent = false;
  const owner = await ownerEmail(db, out.businessId);
  if (req.send_email && out.status === "revoked" && owner) {
    const first = owner.displayName.split(" ")[0] || "there";
    const until = out.trialEndsAt && out.trialEndsAt.getTime() > Date.now()
      ? out.trialEndsAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "Australia/Brisbane" })
      : null;
    emailSent = await send(
      owner.email,
      "Your free Home Service Ops access has ended",
      "Your free access has ended",
      [
        `Hi ${first},`,
        until
          ? `Your free access through Local Service Pro has ended. You keep full access until ${until}, so you have time to choose a plan. Your quotes, jobs and clients stay exactly as they are.`
          : "Your free access through Local Service Pro has ended. Choose a plan to keep using the app. Your quotes, jobs and clients stay exactly as they are.",
      ],
      { label: "Choose a plan", url: `${APP_URL}/settings/billing` },
    );
  }
  return {
    httpStatus: 200,
    body: {
      ok: true,
      status: out.status,
      account_id: String(out.businessId),
      email: owner?.email,
      email_sent: emailSent,
      trial_ends_at: out.trialEndsAt ? new Date(out.trialEndsAt).toISOString() : null,
    },
  };
}

export async function provision(req: ProvisionRequest): Promise<ProvisionResult> {
  return req.action === "grant" ? grant(req) : revoke(req);
}
