import { describe, it, expect } from "vitest";
import { readLcFieldValue } from "./lcSync";

describe("readLcFieldValue", () => {
  it("reads plain contact values", () => {
    expect(readLcFieldValue({ id: "a", value: "Backyard only" })).toEqual({ text: "Backyard only", files: [] });
    expect(readLcFieldValue({ id: "a", value: 250 }).text).toBe("250");
  });
  it("joins multi-select values", () => {
    expect(readLcFieldValue({ id: "a", value: ["Mowing", "Edging"] }).text).toBe("Mowing, Edging");
  });
  it("reads opportunity fieldValue shapes", () => {
    expect(readLcFieldValue({ id: "a", fieldValueString: "Dog in yard" }).text).toBe("Dog in yard");
    expect(readLcFieldValue({ id: "a", fieldValue: true }).text).toBe("true");
  });
  it("pulls file uploads out as files", () => {
    const r = readLcFieldValue({
      id: "a",
      value: {
        "8f0c": { meta: { mimetype: "image/jpeg", originalname: "front.jpg" }, url: "https://msgsndr.example/files/front.jpg" },
        "9a1d": { meta: { mimetype: "application/pdf", originalname: "plan.pdf" }, url: "https://msgsndr.example/files/plan.pdf" },
      },
    });
    expect(r.text).toBe("");
    expect(r.files).toEqual([
      { url: "https://msgsndr.example/files/front.jpg", name: "front.jpg", image: true },
      { url: "https://msgsndr.example/files/plan.pdf", name: "plan.pdf", image: false },
    ]);
  });
  it("treats upload links in text as files", () => {
    const r = readLcFieldValue({ id: "a", value: "https://storage.example.com/uploads/lawn.png" });
    expect(r.files[0]).toMatchObject({ name: "lawn.png", image: true });
  });
  it("ignores empty values", () => {
    expect(readLcFieldValue({ id: "a", value: "" })).toEqual({ text: "", files: [] });
    expect(readLcFieldValue({ id: "a" })).toEqual({ text: "", files: [] });
  });
});
