import { describe, it, expect } from "vitest";
import { parseProvision, verifySignature } from "./salesBrainInbound";
import { signPayload } from "./salesBrainEvents";

const SECRET = "test-secret-123";
const TS = "1761955200";
const NOW = 1761955200_000;
const body = '{"action":"grant","external_id":"cus_1","email":"bob@example.com","business_name":"Bob\'s Plumbing"}';
const sig = `sha256=${signPayload(SECRET, TS, body)}`;

describe("incoming signature", () => {
  it("accepts the exact body signed with the shared secret", () => {
    expect(verifySignature(SECRET, TS, sig, body, NOW)).toEqual({ ok: true });
    expect(verifySignature(SECRET, TS, sig.toUpperCase().replace("SHA256=", "sha256="), body, NOW)).toEqual({ ok: true });
  });

  it("rejects a changed body, wrong secret or missing headers", () => {
    expect(verifySignature(SECRET, TS, sig, body.replace("Bob", "Rob"), NOW).ok).toBe(false);
    expect(verifySignature("other", TS, sig, body, NOW).ok).toBe(false);
    expect(verifySignature(SECRET, null, sig, body, NOW).ok).toBe(false);
    expect(verifySignature(SECRET, TS, null, body, NOW).ok).toBe(false);
    expect(verifySignature(SECRET, TS, "sha256=abc", body, NOW).ok).toBe(false);
  });

  it("allows 5 minutes of clock difference, not more", () => {
    expect(verifySignature(SECRET, TS, sig, body, NOW + 300_000).ok).toBe(true);
    expect(verifySignature(SECRET, TS, sig, body, NOW - 300_000).ok).toBe(true);
    expect(verifySignature(SECRET, TS, sig, body, NOW + 301_000)).toEqual({ ok: false, error: "Timestamp is more than 5 minutes off" });
  });
});

describe("provision request", () => {
  it("grant needs an email and business name; defaults apply", () => {
    const r = parseProvision(body);
    expect(r).toMatchObject({ ok: true, req: { action: "grant", external_id: "cus_1", email: "bob@example.com", send_email: true, grace_days: 14 } });
    expect(parseProvision('{"action":"grant","external_id":"cus_1"}')).toEqual({
      ok: false,
      error: "email: email is required to grant access; business_name: business_name is required to grant access",
    });
  });

  it("normalises email and account_id", () => {
    const r = parseProvision('{"action":"revoke","external_id":"cus_1","account_id":42,"email":" Bob@Example.COM "}');
    expect(r).toMatchObject({ ok: true, req: { account_id: "42", email: "bob@example.com" } });
  });

  it("revoke needs only the external id", () => {
    expect(parseProvision('{"action":"revoke","external_id":"cus_1","grace_days":0}')).toMatchObject({ ok: true, req: { grace_days: 0 } });
  });

  it("rejects bad input", () => {
    expect(parseProvision("not json")).toEqual({ ok: false, error: "Body isn't valid JSON" });
    expect(parseProvision('{"action":"delete","external_id":"x"}').ok).toBe(false);
    expect(parseProvision('{"action":"revoke","external_id":""}').ok).toBe(false);
    expect(parseProvision('{"action":"revoke","external_id":"x","grace_days":365}').ok).toBe(false);
  });
});
