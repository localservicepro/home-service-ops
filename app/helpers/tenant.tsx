import superjson from "superjson";
import { db } from "./db";
import { getServerUserSession } from "./getServerUserSession";
import { NotAuthenticatedError } from "./getSetServerSession";
import { PaymentRequiredError, assertNotReadOnly } from "./billing";
import type { MemberRole } from "./schema";
import { recordActivity, sessionIdOf } from "./salesBrain";
import { bearerToken } from "./getSetServerSession";
import type { User } from "./User";

// Server-only. Every business-data endpoint starts with requireMember(): it resolves the
// signed-in user, their business and their role there. All queries must then filter by
// ctx.businessId — that is the whole tenancy boundary.

export class ForbiddenError extends Error {
  constructor(message = "You don't have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type MemberCtx = {
  user: User;
  businessId: number;
  businessName: string;
  role: MemberRole;
  staffId: number | null;
  /** Set when Local Service Pro staff are viewing this business as its owner (support view). */
  supportSession?: { id: string; allowChanges: boolean; expiresAt: Date };
};

/** The header the app sends from a tab that's in support view: the support session id. */
export const VIEW_AS_HEADER = "x-hso-view-as";

/** Refuses actions on the signed-in person's own login while they're viewing someone else's account. */
export function refuseInSupportView(request: Request) {
  if (request.headers.get(VIEW_AS_HEADER)) throw new ForbiddenError("Not available while viewing a customer's account. Exit the support view first.");
}

/**
 * Staff viewing a business as its owner: the session must be theirs, open and not expired.
 * Read-only unless the session allows changes; every change is recorded.
 */
async function supportContext(request: Request, user: User, sessionId: string): Promise<MemberCtx> {
  if (user.role !== "admin") throw new ForbiddenError("Only Local Service Pro staff can view customer accounts.");
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new ForbiddenError("This support view has ended.");
  const s = await db
    .selectFrom("supportSessions as s")
    .innerJoin("businesses as b", "b.id", "s.businessId")
    .select(["s.id", "s.businessId", "s.allowChanges", "s.expiresAt", "s.endedAt", "s.staffId", "b.name"])
    .where("s.id", "=", sessionId)
    .executeTakeFirst();
  if (!s || s.staffId !== user.id || s.endedAt || s.expiresAt.getTime() <= Date.now()) {
    throw new ForbiddenError("This support view has ended. Start it again from the admin.");
  }
  if (request.method !== "GET") {
    if (!s.allowChanges) throw new ForbiddenError("Read-only support view: you can look but not change anything. Restart it with changes allowed if you need to.");
    await db.insertInto("supportSessionActions").values({ sessionId: s.id, method: request.method, path: new URL(request.url).pathname.replace(/^.*\/api\//, "") }).execute();
  }
  db.updateTable("supportSessions").set({ lastSeenAt: new Date() }).where("id", "=", s.id).execute().catch(() => undefined);
  return { user, businessId: s.businessId, businessName: s.name, role: "owner", staffId: null, supportSession: { id: s.id, allowChanges: s.allowChanges, expiresAt: s.expiresAt } };
}

export const OFFICE: MemberRole[] = ["owner", "admin"];
export const ANY_MEMBER: MemberRole[] = ["owner", "admin", "crew"];

// Changes (non-GET requests) are refused once a business's trial has ended without a plan,
// except for the few actions passed allowExpired (billing, finishing a job, collecting payment).
export async function requireMember(
  request: Request,
  roles: MemberRole[] = OFFICE,
  opts: { allowExpired?: boolean; allowSuspended?: boolean } = {},
): Promise<MemberCtx> {
  const { user } = await getServerUserSession(request);
  const viewAs = request.headers.get(VIEW_AS_HEADER);
  if (viewAs) {
    const ctx = await supportContext(request, user, viewAs);
    if (!roles.includes(ctx.role)) throw new ForbiddenError();
    // Staff looking around isn't customer activity, and a trial that ended doesn't stop support.
    return ctx;
  }
  const m = await db
    .selectFrom("memberships")
    .innerJoin("businesses", "businesses.id", "memberships.businessId")
    .select(["memberships.businessId", "memberships.role", "memberships.staffId", "businesses.name as businessName", "businesses.suspendedAt"])
    .where("memberships.userId", "=", user.id)
    .executeTakeFirst();
  if (!m) throw new ForbiddenError("Your login isn't linked to a business yet.");
  if (!roles.includes(m.role)) throw new ForbiddenError();
  // Suspended by Local Service Pro staff: only the account summary and support stay open.
  if (m.suspendedAt && !opts.allowSuspended) throw new ForbiddenError(SUSPENDED_MESSAGE);
  recordActivity(m.businessId, user.id, sessionIdOf(bearerToken(request)));
  if (request.method !== "GET" && !opts.allowExpired) await assertNotReadOnly(m.businessId);
  return { user, businessId: m.businessId, businessName: m.businessName, role: m.role, staffId: m.staffId };
}

export const SUSPENDED_MESSAGE = "This account has been suspended by Local Service Pro. Message support or email support@localservicepro.com.au.";

export const isOffice = (ctx: MemberCtx) => ctx.role === "owner" || ctx.role === "admin";

/** Crew may only touch jobs assigned to their own crew record. */
export async function assertJobAccess(ctx: MemberCtx, jobId: number) {
  const job = await db
    .selectFrom("jobs")
    .select(["id", "staffId"])
    .where("id", "=", jobId)
    .where("businessId", "=", ctx.businessId)
    .executeTakeFirst();
  if (!job) throw new Error("Job not found");
  if (!isOffice(ctx) && (!ctx.staffId || job.staffId !== ctx.staffId)) throw new ForbiddenError("This job isn't assigned to you.");
  return job;
}

/** Standard error response: 401 signed out, 402 plan limit / no plan, 403 no access, 400 otherwise. */
export function errorResponse(error: unknown, fallbackStatus = 400) {
  const status =
    error instanceof NotAuthenticatedError ? 401 : error instanceof ForbiddenError ? 403 : error instanceof PaymentRequiredError ? 402 : fallbackStatus;
  const message = error instanceof NotAuthenticatedError ? "Please sign in again." : error instanceof Error ? error.message : String(error);
  return new Response(superjson.stringify({ error: message }), { status });
}
