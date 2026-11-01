import { describe, it, expect } from "vitest";
import { parseBatch, starterServices, tradeKey, verifySignature } from "./salesBrainInbound";
import { signPayload } from "./salesBrainEvents";

const SECRET = "test-secret-123";
const TS = "1761955200";
const NOW = 1761955200_000;
const body = '{"events":[{"id":"sb-1234-provision","type":"account.provision","data":{}}]}';

describe("signature verification", () => {
  it("expected hex for a known secret, timestamp and body", () => {
    // Computed independently: printf '%s' "1761955200.{\"events\":[]}" | openssl dgst -sha256 -hmac test-secret-123
    expect(signPayload(SECRET, TS, '{"events":[]}')).toBe("c35a8d7f79db0eca8dab71e8ebac1b0872d5beda2eb63802dfd495bbfa1f871b");
  });

  it("good: the exact body signed with the shared secret", () => {
    const sig = `sha256=${signPayload(SECRET, TS, body)}`;
    expect(verifySignature(SECRET, TS, sig, body, NOW)).toEqual({ ok: true });
  });

  it("bad: changed body, wrong secret, malformed or missing headers", () => {
    const sig = `sha256=${signPayload(SECRET, TS, body)}`;
    expect(verifySignature(SECRET, TS, sig, body.replace("1234", "1235"), NOW)).toEqual({ ok: false, error: "Signature doesn't match" });
    expect(verifySignature("another-secret", TS, sig, body, NOW).ok).toBe(false);
    expect(verifySignature(SECRET, TS, sig.replace("sha256=", ""), body, NOW).ok).toBe(false);
    expect(verifySignature(SECRET, TS, "sha256=abc", body, NOW).ok).toBe(false);
    expect(verifySignature(SECRET, null, sig, body, NOW).ok).toBe(false);
    expect(verifySignature(SECRET, TS, null, body, NOW).ok).toBe(false);
  });

  it("stale: more than 5 minutes either way is refused, 5 minutes is fine", () => {
    const sig = `sha256=${signPayload(SECRET, TS, body)}`;
    expect(verifySignature(SECRET, TS, sig, body, NOW + 300_000).ok).toBe(true);
    expect(verifySignature(SECRET, TS, sig, body, NOW - 300_000).ok).toBe(true);
    expect(verifySignature(SECRET, TS, sig, body, NOW + 301_000)).toEqual({ ok: false, error: "Timestamp is more than 5 minutes off" });
    expect(verifySignature(SECRET, TS, sig, body, NOW - 301_000).ok).toBe(false);
  });
});

describe("batch parsing", () => {
  it("refuses a body without events", () => {
    expect(parseBatch("nope").fatal).toBe("Body isn't valid JSON");
    expect(parseBatch('{"event":[]}').fatal).toBe('Body must be { "events": [ ... ] }');
    expect(parseBatch('{"events":[]}').fatal).toBe("No events");
  });

  it("gives per-event errors that say what's wrong", () => {
    const r = parseBatch(
      JSON.stringify({
        events: [
          { id: "a", type: "account.provision", data: { sales_brain_customer_id: "not-a-uuid", business_name: "", email: "x", access: "trial" } },
          { id: "b", type: "account.deleted", data: {} },
          { type: "account.provision", data: {} },
        ],
      }),
    );
    const [a, b, c] = r.items.map((i) => (i.ok ? null : i.result));
    expect(a).toMatchObject({ id: "a" });
    expect((a as { error: string }).error).toContain("sales_brain_customer_id");
    expect((a as { error: string }).error).toContain("business_name is required");
    expect((a as { error: string }).error).toContain("email isn't a valid email address");
    expect((a as { error: string }).error).toContain('access must be "included"');
    expect(b).toEqual({ id: "b", error: 'Unknown event type "account.deleted"' });
    expect(c).toEqual({ id: "#2", error: "id is required" });
  });
});

describe("workspace details", () => {
  it("matches Sales Brain's trade text to this app's trades", () => {
    expect(tradeKey("Lawn & Garden")).toBe("lawn");
    expect(tradeKey("Lawn mowing")).toBe("lawn");
    expect(tradeKey("House cleaning")).toBe("cleaning");
    expect(tradeKey("Pressure washing")).toBe("pressure");
    expect(tradeKey("Pest control")).toBe("pest");
    expect(tradeKey("Pool & spa")).toBe("pool");
    expect(tradeKey("Electrician")).toBe("other");
    expect(tradeKey("")).toBe("other");
  });

  it("prices services from the trade's starter list when the name matches", () => {
    expect(starterServices("lawn", ["Lawn mowing & edging", "Turf laying"])).toEqual([
      { name: "Lawn mowing & edging", price: 65, freq: "Bi-weekly" },
      { name: "Turf laying", price: 0, freq: "One-time" },
    ]);
  });
});
