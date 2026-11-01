import { randomBytes } from "node:crypto";
import { sql, type Transaction } from "kysely";
import { db } from "./db";
import type { DB, Json } from "./schema";
import { queueAccountSync } from "./salesBrain";
import { isStripeConfigured, stripeApi } from "./stripeConnect";
import { EmailNotConfiguredError, esc, layout, sendAppEmail } from "./mailer";
import { APP_URL, AUTH_URL, env } from "./serverEnv";
import { INCLUDED_PLAN, type EventResult } from "./salesBrainInbound";
import { DataError, type BizRef, type ProvisionRepo, type ProvisionTx, type WorkspaceRows } from "./salesBrainProvision";

// Server-only. The database, Stripe, Supabase Auth and email side of helpers/salesBrainProvision.tsx.

const BIZ_COLS = ["businesses.id", "businesses.comp", "businesses.compSource", "businesses.compEndsAt", "businesses.salesBrainCustomerId"] as const;
const BILLING_LIVE = ["active", "trialing", "past_due", "unpaid"];

function txOps(trx: Transaction<DB>): ProvisionTx {
  const biz = () => trx.selectFrom("businesses").select(BIZ_COLS);
  return {
    async lock(key) {
      await sql`select pg_advisory_xact_lock(hashtext(${key}))`.execute(trx);
    },
    async byCustomerId(customerId) {
      return ((await biz().where("businesses.salesBrainCustomerId", "=", customerId).executeTakeFirst()) as BizRef | undefined) ?? null;
    },
    async byId(id) {
      return ((await biz().where("businesses.id", "=", id).executeTakeFirst()) as BizRef | undefined) ?? null;
    },
    async memberByEmail(email) {
      const m = await trx
        .selectFrom("users")
        .innerJoin("memberships", "memberships.userId", "users.id")
        .innerJoin("businesses", "businesses.id", "memberships.businessId")
        .select([...BIZ_COLS, "memberships.role"])
        .where(sql<string>`lower(users.email)`, "=", email)
        .orderBy("memberships.id")
        .executeTakeFirst();
      if (!m) return null;
      const { role, ...b } = m;
      return { biz: b as BizRef, role };
    },
    async createWorkspace(authId, rows: WorkspaceRows) {
      const user = await trx
        .insertInto("users")
        .values({ authId, email: rows.email, displayName: rows.displayName })
        .onConflict((oc) => oc.column("authId").doUpdateSet({ email: rows.email }))
        .returning("id")
        .executeTakeFirstOrThrow();
      const member = await trx.selectFrom("memberships").select("role").where("userId", "=", user.id).executeTakeFirst();
      if (member) throw new DataError(`${rows.email} already belongs to another business`);
      const b = await trx
        .insertInto("businesses")
        .values({ name: rows.business.name, trade: rows.business.trade, trialEndsAt: null })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("settings")
        .values({
          businessId: b.id,
          owner: rows.settings.owner as unknown as Json,
          business: rows.settings.business as unknown as Json,
          accept: { cash: true, online: true, bank: true },
          bankInfo: { name: "", bank: "", bsb: "", acct: "" },
        })
        .execute();
      await trx.insertInto("memberships").values({ businessId: b.id, userId: user.id, role: "owner" }).execute();
      if (rows.services.length) {
        await trx
          .insertInto("services")
          .values(rows.services.map((s) => ({ businessId: b.id, name: s.name, price: s.price, freq: s.freq, active: true })))
          .execute();
      }
      return b.id;
    },
    async include(businessId, customerId, salesBrainPlan) {
      await trx
        .updateTable("businesses")
        .set({
          comp: true,
          compSource: "salesbrain",
          compNote: INCLUDED_PLAN,
          compEndsAt: null,
          trialEndsAt: null,
          salesBrainCustomerId: customerId,
          salesBrainPlan: salesBrainPlan || null,
          cancelledAt: null,
          cancelReason: null,
          cancelAtPeriodEnd: false,
        })
        .where("id", "=", businessId)
        .execute();
    },
    async endAccess(businessId, endsAt, now) {
      const q = trx.updateTable("businesses").where("id", "=", businessId).where("comp", "=", true).where("compSource", "=", "salesbrain");
      if (endsAt.getTime() <= now.getTime()) {
        await q.set({ comp: false, compSource: null, compNote: null, compEndsAt: endsAt }).execute();
      } else {
        await q.set({ compEndsAt: endsAt }).execute();
      }
    },
    async queueSync(businessId) {
      await queueAccountSync(trx, businessId, { force: true });
    },
  };
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

export const dbProvisionRepo: ProvisionRepo = {
  async processed(eventId) {
    const { rows } = await sql<{ body: string }>`select result::text as body from hso.salesbrain_inbound where id = ${eventId}`.execute(db);
    return rows[0] ? (JSON.parse(rows[0].body) as EventResult) : null;
  },

  read(fn) {
    return db.transaction().execute((trx) => fn(txOps(trx)));
  },

  commit(eventId, type, fn) {
    return db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`sb-event:${eventId}`}))`.execute(trx);
      // Read as text: the camelCase plugin would rename keys inside the stored result.
      const { rows } = await sql<{ body: string }>`select result::text as body from hso.salesbrain_inbound where id = ${eventId}`.execute(trx);
      if (rows[0]) return JSON.parse(rows[0].body) as EventResult;
      const result = await fn(txOps(trx));
      await sql`insert into hso.salesbrain_inbound (id, type, result) values (${eventId}, ${type}, ${JSON.stringify(result)}::jsonb)`.execute(trx);
      return result;
    });
  },

  async hasActiveSubscription(businessId) {
    const b = await db.selectFrom("businesses").select(["stripeSubscriptionId", "subscriptionStatus"]).where("id", "=", businessId).executeTakeFirst();
    return !!b?.stripeSubscriptionId && BILLING_LIVE.includes(b.subscriptionStatus ?? "");
  },

  async stopBilling(businessId) {
    const b = await db.selectFrom("businesses").select(["stripeSubscriptionId"]).where("id", "=", businessId).executeTakeFirstOrThrow();
    if (!b.stripeSubscriptionId) return;
    if (!isStripeConfigured()) throw new Error("Stripe isn't configured, so the subscription can't be cancelled");
    try {
      // Ends now: no further invoices, no proration charge.
      await stripeApi(`/subscriptions/${b.stripeSubscriptionId}`, { method: "DELETE" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/no such subscription|already been canceled|canceled subscription/i.test(msg)) throw e;
    }
    await db.updateTable("businesses").set({ subscriptionStatus: "canceled", cancelAtPeriodEnd: false }).where("id", "=", businessId).execute();
  },

  async ensureLogin(email, displayName) {
    const { rows } = await sql<{ id: string }>`select au.id::text as id from auth.users au where lower(au.email) = ${email} limit 1`.execute(db);
    if (rows[0]) return { authId: rows[0].id, isNew: false };
    // Unconfirmed and without a password: the invite link lets the owner set one (invites/join).
    const u = await authAdmin<{ id: string }>("/admin/users", "POST", {
      email,
      email_confirm: false,
      user_metadata: { display_name: displayName, source: "sales_brain" },
    });
    return { authId: u.id, isNew: true };
  },

  async sendOwnerInvite(businessId, email, ownerName, businessName) {
    await db.deleteFrom("invites").where("businessId", "=", businessId).where("role", "=", "owner").where("acceptedAt", "is", null).execute();
    const token = randomBytes(24).toString("base64url");
    await db.insertInto("invites").values({ businessId, token, email, role: "owner", staffId: null, invitedBy: null }).execute();
    const url = `${APP_URL}/join/${token}`;
    const first = ownerName.trim().split(/\s+/)[0] || "there";
    try {
      await sendAppEmail({
        to: email,
        fromName: "Home Service Ops",
        subject: `Your Home Service Ops account for ${businessName} is ready`,
        html: layout({
          brand: "Home Service Ops",
          heading: "Your account is ready",
          paragraphs: [
            `Hi ${esc(first)},`,
            `Your Sales Brain plan includes Home Service Ops for <b>${esc(businessName)}</b>: quotes, jobs, invoices, your crew and your calendar in one app. We've set it up with your business details, services and service areas.`,
            `Create your login with ${esc(email)} to get started. The link works once and expires in 14 days.`,
          ],
          cta: { label: "Create my login", url },
        }),
        text: `Hi ${first},\n\nYour Sales Brain plan includes Home Service Ops for ${businessName}. Create your login with ${email} (the link works once and expires in 14 days):\n${url}`,
      });
    } catch (e) {
      if (e instanceof EmailNotConfiguredError) return;
      throw e;
    }
  },

  now: () => new Date(),
  log(message, detail) {
    console.error(`[salesbrain inbound] ${message}`, detail instanceof Error ? detail.message : detail ?? "");
  },
};
