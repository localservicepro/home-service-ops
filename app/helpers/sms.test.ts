import { describe, it, expect, vi } from "vitest";
vi.mock("./db", () => ({ db: {} }));
const { toE164, readPrefs } = await import("./sms");

describe("toE164", () => {
  it("formats Australian mobiles and landlines", () => {
    expect(toE164("0412 345 678")).toBe("+61412345678");
    expect(toE164("(07) 5531 2290")).toBe("+61755312290");
    expect(toE164("412345678")).toBe("+61412345678");
    expect(toE164("61412345678")).toBe("+61412345678");
  });
  it("keeps international numbers", () => {
    expect(toE164("+63 917 123 4567")).toBe("+639171234567");
    expect(toE164("0063 917 123 4567")).toBe("+639171234567");
  });
  it("rejects junk", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("123")).toBeNull();
    expect(toE164("+12")).toBeNull();
  });
});

describe("readPrefs", () => {
  it("fills defaults and ignores bad values", () => {
    expect(readPrefs(null)).toEqual({ docsDefault: "both", reviews: "email", ownerAlerts: false, ownerPhone: "" });
    expect(readPrefs({ docsDefault: "sms", reviews: "nope", ownerAlerts: true, ownerPhone: "0412" })).toEqual({ docsDefault: "sms", reviews: "email", ownerAlerts: true, ownerPhone: "0412" });
  });
});
