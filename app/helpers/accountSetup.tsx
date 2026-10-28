import { sql, type Transaction } from "kysely";
import { db } from "./db";
import type { DB, MemberRole } from "./schema";

// Server-only. Links a newly registered user to a business: either the one their invite
// is for, or a brand-new business they own (with a starter settings row).

export async function findOpenInvite(token: string) {
  const inv = await db
    .selectFrom("invites")
    .innerJoin("businesses", "businesses.id", "invites.businessId")
    .select([
      "invites.id",
      "invites.businessId",
      "invites.role",
      "invites.staffId",
      "invites.email",
      "invites.expiresAt",
      "invites.acceptedAt",
      "businesses.name as businessName",
    ])
    .where("invites.token", "=", token)
    .executeTakeFirst();
  if (!inv) return { ok: false as const, reason: "This invite link isn't valid." };
  if (inv.acceptedAt) return { ok: false as const, reason: "This invite has already been used." };
  if (inv.expiresAt.getTime() < Date.now()) return { ok: false as const, reason: "This invite has expired. Ask for a new one." };
  return { ok: true as const, invite: inv };
}

export async function linkNewUser(
  trx: Transaction<DB>,
  user: { id: number; email: string; displayName: string },
  opts: { inviteToken?: string; businessName?: string },
): Promise<{ businessId: number; role: MemberRole }> {
  if (opts.inviteToken) {
    const found = await findOpenInvite(opts.inviteToken);
    if (!found.ok) throw new Error(found.reason);
    const inv = found.invite;
    await trx
      .insertInto("memberships")
      .values({ businessId: inv.businessId, userId: user.id, role: inv.role, staffId: inv.role === "crew" ? inv.staffId : null })
      .execute();
    await trx.updateTable("invites").set({ acceptedAt: new Date(), acceptedUserId: user.id }).where("id", "=", inv.id).execute();
    return { businessId: inv.businessId, role: inv.role };
  }

  const name = opts.businessName?.trim();
  if (!name) throw new Error("Business name is required");
  const biz = await trx.insertInto("businesses").values({ name }).returning("id").executeTakeFirstOrThrow();
  const [first, ...rest] = user.displayName.trim().split(/\s+/);
  await trx
    .insertInto("settings")
    .values({
      businessId: biz.id,
      owner: { first: first ?? "", last: rest.join(" "), role: "Owner", email: user.email, phone: "" },
      business: { name, abn: "", phone: "", email: user.email, address: "", website: "", area: "" },
      accept: { cash: true, online: true, bank: true },
      bankInfo: { name: "", bank: "", bsb: "", acct: "" },
    })
    .execute();
  await trx.insertInto("memberships").values({ businessId: biz.id, userId: user.id, role: "owner" }).execute();
  return { businessId: biz.id, role: "owner" };
}

/**
 * Links a signed-in user who has no business yet: to the business their invite is for, or to a
 * new business they own. The choice comes from sign-up metadata (email sign-up) or from the
 * request (Google sign-up). Without either, the user stays unlinked.
 */
export async function ensureLinked(
  user: { id: number; email: string; displayName: string },
  opts: { inviteToken?: string; businessName?: string },
) {
  if (!opts.inviteToken && !opts.businessName) return null;
  // Fast path: almost every call is for someone who is already linked.
  const linked = await db.selectFrom("memberships").select("id").where("userId", "=", user.id).executeTakeFirst();
  if (linked) return null;
  return db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(${user.id})`.execute(trx);
    const existing = await trx.selectFrom("memberships").select("id").where("userId", "=", user.id).executeTakeFirst();
    if (existing) return null;
    return linkNewUser(trx, user, opts);
  });
}
