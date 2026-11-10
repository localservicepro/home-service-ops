import { describe, it, expect, vi } from "vitest";
vi.mock("./db", () => ({ db: {} }));
const { counterpart, groupThreads, toInboxMessage } = await import("./inbox");

const m = (id: number, direction: "inbound" | "outbound", other: string, text: string, at: string) =>
  direction === "inbound"
    ? { id, direction, from: other, to: "+61400000000", text, created_at: at }
    : { id, direction, to: other, from: null, text, created_at: at };

describe("inbox", () => {
  it("uses the other party's number, normalised", () => {
    expect(counterpart(m(1, "inbound", "0412 345 678", "hi", "2026-10-01T00:00:00Z"))).toBe("+61412345678");
    expect(counterpart(m(2, "outbound", "+61412345678", "yo", "2026-10-01T00:00:00Z"))).toBe("+61412345678");
    expect(counterpart({ id: 3, direction: "inbound", from: null })).toBeNull();
  });

  it("groups by phone, newest thread first, matches clients and counts unread since last read", () => {
    const msgs = [
      m(5, "inbound", "+61412345678", "Can you come Tuesday?", "2026-10-03T10:00:00Z"),
      m(4, "outbound", "+61412345678", "Quote sent", "2026-10-02T10:00:00Z"),
      m(3, "inbound", "+61412345678", "Hi", "2026-10-01T10:00:00Z"),
      m(2, "inbound", "+61498765432", "Thanks!", "2026-10-02T12:00:00Z"),
    ];
    const reads = new Map([["+61412345678", Date.parse("2026-10-01T12:00:00Z")]]);
    const clients = new Map([["+61412345678", { id: 7, name: "Jane Smith" }]]);
    const t = groupThreads(msgs, reads, clients);
    expect(t.map((x) => x.phone)).toEqual(["+61412345678", "+61498765432"]);
    expect(t[0]).toMatchObject({ clientId: 7, name: "Jane Smith", lastText: "Can you come Tuesday?", lastDirection: "in", unread: 1 });
    expect(t[1]).toMatchObject({ clientId: null, name: null, unread: 1 });
  });

  it("shows attachments without text", () => {
    expect(toInboxMessage({ id: 1, direction: "inbound", text: "", media: [{ url: "https://x/y.jpg", type: "image/jpeg" }] }).text).toBe("📎 Attachment");
  });
});
