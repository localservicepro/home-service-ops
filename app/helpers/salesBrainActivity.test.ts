import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: { table: string; values: Record<string, unknown> }[] = [];
vi.mock("./db", () => {
  const chain = (table?: string) => {
    const c: Record<string, unknown> = {};
    c.values = (v: Record<string, unknown>) => (inserts.push({ table: table!, values: v }), c);
    c.onConflict = () => c;
    c.set = () => c;
    c.where = () => c;
    c.execute = async () => [];
    return c;
  };
  return { db: { insertInto: (t: string) => chain(t), updateTable: () => chain() } };
});
vi.mock("./serverEnv", () => ({ env: () => undefined, AUTH_URL: "" }));
vi.mock("./mailer", () => ({ sendAppEmail: vi.fn(), EmailNotConfiguredError: class extends Error {} }));
vi.mock("./stripeConnect", () => ({ isStripeConfigured: () => false, stripeApi: vi.fn() }));

const { recordActivity, sessionIdOf } = await import("./salesBrain");
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = (claims: unknown) => `${b64({ alg: "ES256" })}.${b64(claims)}.sig`;
const SID = "0b6f6a2e-5c1d-4f7e-9a3b-2c8d1e4f5a6b";

beforeEach(() => {
  inserts.length = 0;
});

describe("sign-ins and active days", () => {
  it("reads the Auth session id from the access token", () => {
    expect(sessionIdOf(token({ sub: "u", session_id: SID }))).toBe(SID);
    expect(sessionIdOf(token({ sub: "u" }))).toBeNull();
    expect(sessionIdOf(token({ session_id: "not-an-id" }))).toBeNull();
    expect(sessionIdOf("garbage")).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });

  it("records each session once and each member's day once", () => {
    recordActivity(7, 41, SID);
    recordActivity(7, 41, SID);
    recordActivity(7, 42, null);
    const sessions = inserts.filter((i) => i.table === "accountSessions");
    const days = inserts.filter((i) => i.table === "accountActivity");
    expect(sessions).toEqual([{ table: "accountSessions", values: { sessionId: SID, businessId: 7, userId: 41 } }]);
    expect(days.map((d) => d.values.userId)).toEqual([41, 42]);
    expect(days[0].values.day).toBeInstanceOf(Date);
  });
});
