import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
vi.mock("./db", () => ({ db: {} }));
vi.mock("./billing", () => ({ getBilling: vi.fn() }));
vi.mock("./storage", () => ({
  copyRemoteFile: vi.fn(async (url: string, name: string, o: { imagesOnly?: boolean }) => (url.includes("broken") ? null : `https://store.example/${name}${o.imagesOnly ? ".jpg" : ".pdf"}`)),
}));
vi.mock("./leadConnector", () => ({
  lcFetch: vi.fn(async (_b: number, path: string) => {
    calls.push(path);
    const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
    if (path.startsWith("/locations/")) {
      return json({ customFields: [
        { id: "f_size", name: "Lawn size (m²)", position: 2 },
        { id: "f_gate", name: "Gate code", position: 1 },
        { id: "f_photos", name: "Yard photos", position: 3, dataType: "FILE_UPLOAD" },
      ] });
    }
    if (path.endsWith("/notes")) {
      return json({ notes: [
        { body: "<p>Second call: wants fortnightly</p>", dateAdded: "2026-10-02T00:00:00Z" },
        { body: "First call: dog in backyard", dateAdded: "2026-10-01T00:00:00Z" },
      ] });
    }
    return new Response("{}", { status: 404 });
  }),
}));

const { leadDetails } = await import("./lcSync");
const conn = { businessId: 1, locationId: "loc1", pipelineId: "p1", stageMap: {}, importLeads: true, pushNew: true, importAfter: null, connectedAt: new Date() };

describe("leadDetails", () => {
  beforeEach(() => { calls.length = 0; });
  it("names custom fields, copies images and collects notes in order", async () => {
    const r = await leadDetails(
      conn,
      { id: "opp1", contactId: "c1", customFields: [{ id: "f_size", fieldValueNumber: 320 }, { id: "f_photos", fieldValue: {
        a: { meta: { mimetype: "image/jpeg", originalname: "front.jpg" }, url: "https://ghl.example/files/front.jpg" },
        b: { meta: { mimetype: "application/pdf", originalname: "quote.pdf" }, url: "https://ghl.example/files/quote.pdf" },
      } }] },
      { customFields: [{ id: "f_gate", value: "4821#" }, { id: "unknown", value: "Mystery" }, { id: "f_empty", value: "" }] },
    );
    expect(r.customFields).toEqual([
      { label: "Gate code", value: "4821#" },
      { label: "Lawn size (m²)", value: "320" },
      { label: "Yard photos", value: "https://store.example/job-photos/1/lc-opp1-1.pdf" },
      { label: "Custom field", value: "Mystery" },
    ]);
    expect(r.photos).toEqual(["https://store.example/job-photos/1/lc-opp1-0.jpg"]);
    expect(r.notes).toEqual(["First call: dog in backyard", "Second call: wants fortnightly"]);
    expect(calls).toContain("/locations/loc1/customFields?model=all");
  });
});
