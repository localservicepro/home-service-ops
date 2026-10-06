import superjson from "superjson";
import { db } from "./db";
import { getServerUserSession } from "./getServerUserSession";
import { NotAuthenticatedError } from "./getSetServerSession";
import { PaymentRequiredError, assertNotReadOnly } from "./billing";
import type { MemberRole } from "./schema";
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
};

export const OFFICE: MemberRole[] = ["owner", "admin"];
export const ANY_MEMBER: MemberRole[] = ["owner", "admin", "crew"];

// Changes (non-GET requests) are refused once a business's trial has ended without a plan,
// except for the few actions passed allowExpired (billing, finishing a job, collecting payment).
export async function requireMember(
  request: Request,
  roles: MemberRole[] = OFFICE,
  opts: { allowExpired?: boolean } = {},
): Promise<MemberCtx> {
  const { user } = await getServerUserSession(request);
  const m = await db
    .selectFrom("memberships")
    .innerJoin("businesses", "businesses.id", "memberships.businessId")
    .select(["memberships.businessId", "memberships.role", "memberships.staffId", "businesses.name as businessName"])
    .where("memberships.userId", "=", user.id)
    .executeTakeFirst();
  if (!m) throw new ForbiddenError("Your login isn't linked to a business yet.");
  if (!roles.includes(m.role)) throw new ForbiddenError();
  if (request.method !== "GET" && !opts.allowExpired) await assertNotReadOnly(m.businessId);
  return { user, businessId: m.businessId, businessName: m.businessName, role: m.role, staffId: m.staffId };
}

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
