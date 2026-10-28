import { describe, it, expect } from "vitest";
import { effectiveChannel, readMessagePrefs } from "./messagePrefsShared";

describe("message prefs", () => {
  it("defaults everything to email", () => {
    expect(readMessagePrefs(null)).toEqual({ quotes: "email", invoices: "email", reviews: "email", reminders: "email" });
    expect(readMessagePrefs({ quotes: "fax" })).toEqual({ quotes: "email", invoices: "email", reviews: "email", reminders: "email" });
  });
  it("keeps saved choices", () => {
    expect(readMessagePrefs({ quotes: "both", invoices: "sms", reviews: "email", reminders: "both" })).toEqual({ quotes: "both", invoices: "sms", reviews: "email", reminders: "both" });
  });
  it("falls back to the old SMS Gateway choices when nothing is saved yet", () => {
    expect(readMessagePrefs({}, { docsDefault: "both", reviews: "sms" })).toEqual({ quotes: "both", invoices: "both", reviews: "sms", reminders: "email" });
    expect(readMessagePrefs({ quotes: "email" }, { docsDefault: "sms" })).toEqual({ quotes: "email", invoices: "sms", reviews: "email", reminders: "email" });
  });
  it("sends by email until SMS Gateway is ready", () => {
    expect(effectiveChannel("both", false)).toBe("email");
    expect(effectiveChannel("sms", true)).toBe("sms");
  });
});
