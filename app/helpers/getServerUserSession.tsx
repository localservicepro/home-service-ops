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

// ---- Local access-token check (no round trip to Supabase Auth on every request) ----
// Supabase signs access tokens with the project's asymmetric key (ES256), published as JWKS.
// Tokens signed another way (e.g. the legacy HS256 secret) fall back to asking Auth.

type Jwk = JsonWebKey & { kid?: string; alg?: string };
let jwks: { at: number; keys: Map<string, CryptoKey> } | null = null;

const b64urlBytes = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function signingKey(kid: string, refresh = false): Promise<CryptoKey | null> {
  if (!jwks || refresh || Date.now() - jwks.at > 10 * 60 * 1000) {
    const res = await fetch(`${AUTH_URL}/.well-known/jwks.json`);
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = new Map<string, CryptoKey>();
    for (const k of body.keys ?? []) {
      if (!k.kid || k.kty !== "EC" || k.crv !== "P-256") continue;
      keys.set(k.kid, await crypto.subtle.importKey("jwk", k, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]));
    }
    jwks = { at: Date.now(), keys };
  }
  if (!kid) return null;
  const key = jwks.keys.get(kid);
  if (!key && !refresh && Date.now() - jwks.at > 30_000) return signingKey(kid, true); // key rotated
  return key ?? null;
}

/** The user from a valid ES256 access token, null if it can't be checked locally, throws if invalid. */
async function verifyLocally(token: string): Promise<AuthUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new NotAuthenticatedError();
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
  } catch {
    throw new NotAuthenticatedError();
  }
  if (header.alg !== "ES256" || !header.kid) return null;
  const key = await signingKey(header.kid).catch(() => null);
  if (!key) return null;
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  const now = Date.now() / 1000;
  if (
    !ok ||
    typeof claims.sub !== "string" ||
    claims.role !== "authenticated" ||
    claims.iss !== AUTH_URL ||
    typeof claims.exp !== "number" ||
    claims.exp < now
  ) {
    throw new NotAuthenticatedError();
  }
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    user_metadata: (claims.user_metadata as Record<string, unknown>) ?? {},
    app_metadata: (claims.app_metadata as Record<string, unknown>) ?? {},
  };
}

export async function getAuthUser(request: Request): Promise<AuthUser> {
  const token = bearerToken(request);
  if (!token) throw new NotAuthenticatedError();
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  let user = await verifyLocally(token);
  if (!user) {
    const res = await fetch(`${AUTH_URL}/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env("SUPABASE_ANON_KEY") ?? "" },
    });
    if (!res.ok) throw new NotAuthenticatedError();
    user = (await res.json()) as AuthUser;
  }
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

/** Loads the token signing keys ahead of the first request. */
export function warmAuthKeys() {
  signingKey("").catch(() => undefined);
}
