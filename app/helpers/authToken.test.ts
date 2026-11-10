import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("./db", () => ({ db: {} }));

const AUTH = "http://localhost:54321/auth/v1";
let priv: CryptoKey;
let jwk: JsonWebKey;
const fetchMock = vi.fn(async (url: string) => {
  if (url === `${AUTH}/.well-known/jwks.json`) return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "k1", alg: "ES256" }] }));
  if (url === `${AUTH}/user`) return new Response(JSON.stringify({ id: "from-auth-api", email: "x@y.z" }));
  return new Response("{}", { status: 404 });
});

const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function token(claims: Record<string, unknown>, opts: { kid?: string; alg?: string; tamper?: boolean } = {}) {
  const h = b64url(JSON.stringify({ alg: opts.alg ?? "ES256", kid: opts.kid ?? "k1", typ: "JWT" }));
  const p = b64url(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, new TextEncoder().encode(`${h}.${p}`)));
  if (opts.tamper) sig[0] ^= 1;
  return `${h}.${p}.${b64url(sig)}`;
}
const req = (t: string) => new Request("http://x/api", { headers: { Authorization: `Bearer ${t}` } });
const good = () => ({ sub: "user-1", email: "a@b.com", role: "authenticated", iss: AUTH, exp: Math.floor(Date.now() / 1000) + 600, user_metadata: { invite_token: "abc" } });

let getAuthUser: (r: Request) => Promise<{ id: string; email: string; user_metadata?: Record<string, unknown> }>;
beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  priv = kp.privateKey;
  jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  vi.stubGlobal("fetch", fetchMock);
  ({ getAuthUser } = await import("./getServerUserSession"));
});

describe("getAuthUser", () => {
  it("accepts a valid ES256 token without calling the Auth API", async () => {
    const u = await getAuthUser(req(await token(good())));
    expect(u).toMatchObject({ id: "user-1", email: "a@b.com", user_metadata: { invite_token: "abc" } });
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/user"))).toBe(false);
  });
  it("rejects a tampered signature", async () => {
    await expect(getAuthUser(req(await token({ ...good(), sub: "user-2" }, { tamper: true })))).rejects.toThrow();
  });
  it("rejects an expired token", async () => {
    await expect(getAuthUser(req(await token({ ...good(), sub: "user-3", exp: Math.floor(Date.now() / 1000) - 5 })))).rejects.toThrow();
  });
  it("rejects a token from another issuer", async () => {
    await expect(getAuthUser(req(await token({ ...good(), sub: "user-4", iss: "https://evil.example/auth/v1" })))).rejects.toThrow();
  });
  it("rejects the anon key's role", async () => {
    await expect(getAuthUser(req(await token({ ...good(), sub: "user-5", role: "anon" })))).rejects.toThrow();
  });
  it("falls back to the Auth API for other token types", async () => {
    const u = await getAuthUser(req(await token({ ...good(), sub: "user-6" }, { alg: "HS256" })));
    expect(u.id).toBe("from-auth-api");
  });
});
