import superjson from "superjson";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import type { User } from "../../helpers/User";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { ensureLinked } from "../../helpers/accountSetup";
import { ANY_MEMBER, requireMember } from "../../helpers/tenant";
import { loadMe } from "../account/me_GET";

// The signed-in user's profile. On first sign-in this also links them to their business:
// email sign-ups carry business_name / invite_token in Supabase user metadata; Google sign-ups
// pass mode / invite / business in the query string. Anyone else gets a new business.
export async function handle(request: Request) {
  try {
    const { user, authUser } = await getServerUserSession(request);
    const q = new URL(request.url).searchParams;
    const meta = authUser.user_metadata ?? {};
    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);
    const inviteToken = s(meta.invite_token) ?? s(q.get("invite"));
    const first = user.displayName.trim().split(/\s+/)[0] || "My";
    const businessName = inviteToken
      ? undefined
      : // No invite: their own business. Accounts made before this app (or via Google sign-in) get a
        // placeholder name that onboarding asks them to replace.
        (s(meta.business_name) ?? s(q.get("business")) ?? `${first}'s business`);
    try {
      await ensureLinked(user, { inviteToken, businessName });
    } catch (e) {
      console.error("[auth/session] couldn't link user", user.id, e instanceof Error ? e.message : e);
    }
    // Include the business/role summary so the app can render without a second round trip.
    const me = await requireMember(request, ANY_MEMBER)
      .then(loadMe)
      .catch(() => undefined);
    return new Response(superjson.stringify({ user: user satisfies User, me }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    const status = error instanceof NotAuthenticatedError ? 401 : 400;
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : "Session check failed" }), { status });
  }
}
