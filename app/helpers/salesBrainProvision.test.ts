import { describe, it, expect, beforeEach } from "vitest";
import { INCLUDED_PLAN, type EventResult } from "./salesBrainInbound";
import { processInbound, workspaceRows, type BizRef, type ProvisionRepo, type ProvisionTx, type WorkspaceRows } from "./salesBrainProvision";

// The rules in salesBrainProvision.tsx run against an in-memory store that behaves like the
// database one: a failed transaction leaves nothing behind, and results are stored per event id.

type Biz = BizRef & {
  name: string;
  trialEndsAt: Date | null;
  subscription: "active" | "canceled" | null;
  rows?: WorkspaceRows;
  jobs: number;
  salesBrainPlan: string | null;
};
type State = {
  businesses: Biz[];
  users: { email: string; authId: string; businessId: number | null; role: string | null }[];
  processed: Record<string, EventResult>;
  logins: string[];
};

const NOW = new Date("2026-11-02T00:00:00Z");
const clone = (s: State): State => structuredClone(s);

function memoryRepo(initial: Partial<State> = {}) {
  let state: State = { businesses: [], users: [], processed: {}, logins: [], ...initial };
  const calls = { stopBilling: [] as number[], invites: [] as { businessId: number; email: string }[], syncs: [] as number[] };
  const ref = (b: Biz): BizRef => ({ id: b.id, comp: b.comp, compSource: b.compSource, compEndsAt: b.compEndsAt, salesBrainCustomerId: b.salesBrainCustomerId });

  const tx = (s: State, syncs: number[]): ProvisionTx => ({
    async lock() {},
    async byCustomerId(id) {
      const b = s.businesses.find((x) => x.salesBrainCustomerId === id);
      return b ? ref(b) : null;
    },
    async byId(id) {
      const b = s.businesses.find((x) => x.id === id);
      return b ? ref(b) : null;
    },
    async memberByEmail(email) {
      const u = s.users.find((x) => x.email === email && x.businessId != null);
      const b = u && s.businesses.find((x) => x.id === u.businessId);
      return b ? { biz: ref(b), role: u!.role! } : null;
    },
    async createWorkspace(authId, rows) {
      const id = Math.max(100, ...s.businesses.map((b) => b.id)) + 1;
      s.businesses.push({
        id,
        name: rows.business.name,
        comp: false,
        compSource: null,
        compEndsAt: null,
        salesBrainCustomerId: null,
        trialEndsAt: null,
        subscription: null,
        rows,
        jobs: 0,
        salesBrainPlan: null,
      });
      const u = s.users.find((x) => x.authId === authId);
      if (u) Object.assign(u, { businessId: id, role: "owner" });
      else s.users.push({ email: rows.email, authId, businessId: id, role: "owner" });
      return id;
    },
    async include(businessId, customerId, plan) {
      Object.assign(s.businesses.find((b) => b.id === businessId)!, {
        comp: true,
        compSource: "salesbrain",
        compEndsAt: null,
        trialEndsAt: null,
        salesBrainCustomerId: customerId,
        salesBrainPlan: plan || null,
      });
    },
    async endAccess(businessId, endsAt, now) {
      const b = s.businesses.find((x) => x.id === businessId)!;
      if (!b.comp || b.compSource !== "salesbrain") return;
      if (endsAt <= now) Object.assign(b, { comp: false, compSource: null, compEndsAt: endsAt });
      else b.compEndsAt = endsAt;
    },
    async queueSync(id) {
      syncs.push(id);
    },
  });

  const repo: ProvisionRepo = {
    async processed(id) {
      return state.processed[id] ?? null;
    },
    async read(fn) {
      return fn(tx(clone(state), []));
    },
    async commit(id, _type, fn) {
      if (state.processed[id]) return state.processed[id];
      const draft = clone(state);
      const syncs: number[] = [];
      const result = await fn(tx(draft, syncs)); // throws: draft is dropped, like a rollback
      draft.processed[id] = result;
      state = draft;
      calls.syncs.push(...syncs);
      return result;
    },
    async hasActiveSubscription(id) {
      return state.businesses.find((b) => b.id === id)?.subscription === "active";
    },
    async stopBilling(id) {
      calls.stopBilling.push(id);
      state.businesses.find((b) => b.id === id)!.subscription = "canceled";
    },
    async ensureLogin(email) {
      const u = state.users.find((x) => x.email === email);
      if (u) return { authId: u.authId, isNew: false };
      const authId = `auth-${state.logins.length + 1}`;
      state.logins.push(email);
      state.users.push({ email, authId, businessId: null, role: null });
      return { authId, isNew: true };
    },
    async sendOwnerInvite(businessId, email) {
      calls.invites.push({ businessId, email });
    },
    now: () => NOW,
    log() {},
  };
  return { repo, calls, get state() { return state; } };
}

const CUSTOMER = "3f6c2a1e-8b4d-4c2a-9f1e-2d7b6a5c4e3f";
const provisionData = {
  sales_brain_customer_id: CUSTOMER,
  business_name: "Bob's Lawns",
  owner_name: "Bob Smith",
  email: "bob@bobslawns.com.au",
  phone: "0400 000 000",
  abn: "12 345 678 901",
  address: "1 Main St, Brisbane QLD 4000",
  trade: "Lawn & Garden",
  services: ["Lawn mowing & edging", "Turf laying"],
  service_areas: ["Brisbane North", "Moreton Bay"],
  website: "https://bobslawns.com.au",
  google_profile: "https://g.page/bobslawns",
  plan: "Growth",
  access: "included",
};
const body = (...events: unknown[]) => JSON.stringify({ events });
const provisionEvent = (id = "sb-1234-provision", data: object = provisionData) => ({ id, type: "account.provision", data });

describe("account.provision", () => {
  let m: ReturnType<typeof memoryRepo>;
  beforeEach(() => {
    m = memoryRepo();
  });

  it("creates the workspace and owner from Sales Brain's details, on the free included plan, and invites the owner", async () => {
    const out = await processInbound(m.repo, body(provisionEvent()));
    expect(out).toEqual({ status: 200, body: { results: [{ id: "sb-1234-provision", account_id: "101", status: "created" }] } });

    const b = m.state.businesses[0];
    expect(b).toMatchObject({ comp: true, compSource: "salesbrain", compEndsAt: null, trialEndsAt: null, salesBrainCustomerId: CUSTOMER, salesBrainPlan: "Growth" });
    expect(b.rows).toEqual(workspaceRows(provisionData as never));
    expect(b.rows!.business).toEqual({ name: "Bob's Lawns", trade: "lawn" });
    expect(b.rows!.settings.business).toMatchObject({ abn: "12 345 678 901", address: "1 Main St, Brisbane QLD 4000", area: "Brisbane North, Moreton Bay", website: "https://bobslawns.com.au", phone: "0400 000 000" });
    expect(b.rows!.settings.owner).toMatchObject({ first: "Bob", last: "Smith", email: "bob@bobslawns.com.au" });
    expect(b.rows!.services).toEqual([
      { name: "Lawn mowing & edging", price: 65, freq: "Bi-weekly" },
      { name: "Turf laying", price: 0, freq: "One-time" },
    ]);
    expect(m.state.users).toEqual([{ email: "bob@bobslawns.com.au", authId: "auth-1", businessId: 101, role: "owner" }]);
    expect(m.calls.invites).toEqual([{ businessId: 101, email: "bob@bobslawns.com.au" }]);
    expect(m.calls.stopBilling).toEqual([]);
    expect(m.calls.syncs).toEqual([101]); // account.upserted right after provisioning
  });

  it("links an existing owner's account, switches it to the included plan and stops their billing", async () => {
    m = memoryRepo({
      businesses: [{ id: 7, name: "Bob's Lawns", comp: false, compSource: null, compEndsAt: null, salesBrainCustomerId: null, trialEndsAt: null, subscription: "active", jobs: 42, salesBrainPlan: null }],
      users: [{ email: "bob@bobslawns.com.au", authId: "auth-existing", businessId: 7, role: "owner" }],
    });
    const out = await processInbound(m.repo, body(provisionEvent()));
    expect(out).toEqual({ status: 200, body: { results: [{ id: "sb-1234-provision", account_id: "7", status: "linked" }] } });
    expect(m.calls.stopBilling).toEqual([7]);
    expect(m.state.businesses[0]).toMatchObject({ comp: true, compSource: "salesbrain", salesBrainCustomerId: CUSTOMER, subscription: "canceled", jobs: 42 });
    expect(m.state.businesses).toHaveLength(1);
    expect(m.state.logins).toEqual([]); // no new login
    expect(m.calls.invites).toEqual([]); // they already sign in
    expect(m.calls.syncs).toEqual([7]);
  });

  it("finds a linked account by Sales Brain's customer id even if the email changed", async () => {
    await processInbound(m.repo, body(provisionEvent()));
    const out = await processInbound(m.repo, body(provisionEvent("sb-1234-provision-2", { ...provisionData, email: "new@bobslawns.com.au" })));
    expect(out.body.results).toEqual([{ id: "sb-1234-provision-2", account_id: "101", status: "linked" }]);
    expect(m.state.businesses).toHaveLength(1);
  });

  it("the same event id twice returns the same result and creates nothing more", async () => {
    const first = await processInbound(m.repo, body(provisionEvent()));
    const again = await processInbound(m.repo, body(provisionEvent()));
    const inOneBatch = await processInbound(m.repo, body(provisionEvent(), provisionEvent()));
    expect(again).toEqual(first);
    expect(inOneBatch.body.results).toEqual([first.body.results[0], first.body.results[0]]);
    expect(m.state.businesses).toHaveLength(1);
    expect(m.state.logins).toHaveLength(1);
    expect(m.calls.invites).toHaveLength(1);
    expect(m.calls.syncs).toHaveLength(1);
  });

  it("400 with a reason when the email belongs to a crew member or another Sales Brain customer", async () => {
    m = memoryRepo({
      businesses: [{ id: 9, name: "Other Co", comp: false, compSource: null, compEndsAt: null, salesBrainCustomerId: null, trialEndsAt: null, subscription: null, jobs: 0, salesBrainPlan: null }],
      users: [{ email: "bob@bobslawns.com.au", authId: "a", businessId: 9, role: "crew" }],
    });
    const out = await processInbound(m.repo, body(provisionEvent()));
    expect(out.status).toBe(400);
    expect(out.body.results[0]).toEqual({ id: "sb-1234-provision", error: expect.stringContaining("already a team member of another business") });
    expect(m.state.processed).toEqual({}); // can be sent again once fixed

    m = memoryRepo({
      businesses: [{ id: 9, name: "Bob", comp: true, compSource: "salesbrain", compEndsAt: null, salesBrainCustomerId: "11111111-1111-4111-8111-111111111111", trialEndsAt: null, subscription: null, jobs: 0, salesBrainPlan: null }],
      users: [{ email: "bob@bobslawns.com.au", authId: "a", businessId: 9, role: "owner" }],
    });
    expect((await processInbound(m.repo, body(provisionEvent()))).body.results[0]).toEqual({
      id: "sb-1234-provision",
      error: expect.stringContaining("linked to another Sales Brain customer"),
    });
  });

  it("a bad event doesn't stop the good ones; the reply is 400 listing both", async () => {
    const out = await processInbound(m.repo, body({ id: "bad", type: "account.provision", data: { ...provisionData, email: "nope" } }, provisionEvent()));
    expect(out.status).toBe(400);
    expect(out.body.results).toEqual([
      { id: "bad", error: "email: email isn't a valid email address" },
      { id: "sb-1234-provision", account_id: "101", status: "created" },
    ]);
  });

  it("a failure on our side is 503 and isn't stored, so a retry processes it", async () => {
    const flaky = memoryRepo();
    const ensure = flaky.repo.ensureLogin;
    flaky.repo.ensureLogin = async () => {
      throw new Error("Supabase Auth answered 500");
    };
    const out = await processInbound(flaky.repo, body(provisionEvent()));
    expect(out).toEqual({ status: 503, body: { results: [{ id: "sb-1234-provision", error: "Temporary problem on our side. Send it again later." }] } });
    flaky.repo.ensureLogin = ensure;
    expect((await processInbound(flaky.repo, body(provisionEvent()))).body.results[0]).toMatchObject({ status: "created" });
  });
});

describe("account.access_ended", () => {
  const ended = (id: string, ends_at: string, extra: object = {}) => ({
    id,
    type: "account.access_ended",
    data: { sales_brain_customer_id: CUSTOMER, account_id: "101", email: "bob@bobslawns.com.au", ends_at, ...extra },
  });

  it("keeps the account and its data and schedules the downgrade for ends_at", async () => {
    const m = memoryRepo();
    await processInbound(m.repo, body(provisionEvent()));
    m.state.businesses[0].jobs = 25;
    const out = await processInbound(m.repo, body(ended("sb-1234-ended", "2026-12-01T00:00:00Z")));
    expect(out).toEqual({ status: 200, body: { results: [{ id: "sb-1234-ended", account_id: "101", status: "ended" }] } });
    const b = m.state.businesses[0];
    // Still free until then; the tick and billing checks switch it off at ends_at.
    expect(b).toMatchObject({ comp: true, compSource: "salesbrain", compEndsAt: new Date("2026-12-01T00:00:00Z"), salesBrainCustomerId: CUSTOMER, jobs: 25 });
    expect(b.rows!.services).toHaveLength(2);
    expect(m.state.users).toHaveLength(1);
    expect(m.calls.syncs).toEqual([101, 101]); // account.upserted after provisioning and after ending
  });

  it("an ends_at already passed ends free access now; the account stays, with no trial", async () => {
    const m = memoryRepo();
    await processInbound(m.repo, body(provisionEvent()));
    await processInbound(m.repo, body(ended("sb-1234-ended", "2026-11-01T00:00:00Z")));
    expect(m.state.businesses[0]).toMatchObject({ comp: false, compSource: null, trialEndsAt: null, salesBrainCustomerId: CUSTOMER, subscription: null });
  });

  it("a later account.provision gives free access again", async () => {
    const m = memoryRepo();
    await processInbound(m.repo, body(provisionEvent()));
    await processInbound(m.repo, body(ended("sb-1234-ended", "2026-11-01T00:00:00Z")));
    const out = await processInbound(m.repo, body(provisionEvent("sb-1234-provision-again")));
    expect(out.body.results).toEqual([{ id: "sb-1234-provision-again", account_id: "101", status: "linked" }]);
    expect(m.state.businesses[0]).toMatchObject({ comp: true, compSource: "salesbrain", compEndsAt: null });
    expect(m.calls.invites).toHaveLength(1);
  });

  it("the same id twice gives the same result", async () => {
    const m = memoryRepo();
    await processInbound(m.repo, body(provisionEvent()));
    const a = await processInbound(m.repo, body(ended("sb-1234-ended", "2026-12-01T00:00:00Z")));
    const b = await processInbound(m.repo, body(ended("sb-1234-ended", "2026-12-15T00:00:00Z")));
    expect(b).toEqual(a);
    expect(m.state.businesses[0].compEndsAt).toEqual(new Date("2026-12-01T00:00:00Z"));
  });

  it("400 when the account doesn't match the customer or was never linked", async () => {
    const m = memoryRepo();
    expect((await processInbound(m.repo, body(ended("x1", "2026-12-01T00:00:00Z", { account_id: null })))).body.results[0]).toEqual({
      id: "x1",
      error: "No account is linked to this Sales Brain customer",
    });
    await processInbound(m.repo, body(provisionEvent()));
    expect((await processInbound(m.repo, body(ended("x2", "2026-12-01T00:00:00Z", { account_id: "55" })))).body.results[0]).toEqual({
      id: "x2",
      error: "account_id 55 isn't the account linked to this customer (101)",
    });
    expect((await processInbound(m.repo, body(ended("x3", "next week")))).body.results[0]).toEqual({ id: "x3", error: "ends_at: ends_at must be an ISO date-time" });
  });

  it("leaves free access given by staff alone", async () => {
    const m = memoryRepo({
      businesses: [{ id: 101, name: "Bob", comp: true, compSource: "staff", compEndsAt: null, salesBrainCustomerId: CUSTOMER, trialEndsAt: null, subscription: null, jobs: 0, salesBrainPlan: null }],
    });
    const out = await processInbound(m.repo, body(ended("x", "2026-12-01T00:00:00Z")));
    expect(out.status).toBe(400);
    expect(m.state.businesses[0]).toMatchObject({ comp: true, compEndsAt: null });
  });
});

it("the included plan is named for Sales Brain", () => {
  expect(INCLUDED_PLAN).toBe("Included with Sales Brain");
});
