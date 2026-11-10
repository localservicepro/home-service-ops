import { describe, expect, it } from "vitest";
import { pricing } from "./pricing";

describe("pricing.calcTotals", () => {
  it("adds 10% GST after the discount", () => {
    const t = pricing.calcTotals([{ qty: 1, price: 65 }, { qty: 1, price: 120 }], 0, true);
    expect(t).toEqual({ sub: 185, disc: 0, gst: 18.5, total: 203.5 });
  });
  it("caps the discount at the subtotal and skips GST when off", () => {
    expect(pricing.calcTotals([{ qty: 2, price: "40" }], 100, false)).toEqual({ sub: 80, disc: 80, gst: 0, total: 0 });
  });
});
