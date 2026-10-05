import { db } from "./db";
import type { User } from "./User";
import { bearerToken, NotAuthenticatedError } from "./getSetServerSession";
import { AUTH_URL, env } from "./serverEnv";

// Server-only. Resolves the Supabase Auth user behind the request's access token, then the
// app profile (hso.users) for it, creating the profile on first sign-in.

export type AuthUser = {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

const cache = new Map<string, { user: AuthUser; until: number }>();

export async function getAuthUser(request: Request): Promise<AuthUser> {
  const token = bearerToken(request);
  if (!token) throw new NotAuthenticatedError();
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const res = await fetch(`${AUTH_URL}/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env("SUPABASE_ANON_KEY") ?? "" },
  });
  if (!res.ok) throw new NotAuthenticatedError();
  const user = (await res.json()) as AuthUser;
  if (!user?.id) throw new NotAuthenticatedError();
  if (cache.size > 500) cache.clear();
  cache.set(token, { user, until: Date.now() + 60_000 });
  return user;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function getServerUserSession(request: Request): Promise<{ user: User; authUser: AuthUser }> {
  const au = await getAuthUser(request);
  const email = (au.email ?? "").toLowerCase();
  const meta = au.user_metadata ?? {};
  let row = await db
    .selectFrom("users")
    .select(["id", "email", "displayName", "avatarUrl", "role"])
    .where("authId", "=", au.id)
    .executeTakeFirst();
  if (!row) {
    const displayName = str(meta.display_name) || str(meta.full_name) || str(meta.name) || email.split("@")[0] || "New user";
    row = await db
      .insertInto("users")
      .values({ authId: au.id, email, displayName, avatarUrl: str(meta.avatar_url) || str(meta.picture) || null })
      .onConflict((oc) => oc.column("authId").doUpdateSet({ email }))
      .returning(["id", "email", "displayName", "avatarUrl", "role"])
      .executeTakeFirstOrThrow();
  } else if (email && row.email !== email) {
    await db.updateTable("users").set({ email, updatedAt: new Date() }).where("id", "=", row.id).execute();
    row = { ...row, email };
  }
  return { user: row satisfies User, authUser: au };
}
