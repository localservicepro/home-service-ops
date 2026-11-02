import {
  INCLUDED_PLAN,
  batchStatus,
  splitName,
  starterServices,
  tradeKey,
  type AccessEndedData,
  type EventResult,
  type InboundEvent,
  type ProvisionData,
  parseBatch,
} from "./salesBrainInbound";

// Server-only. What Sales Brain's events do to accounts. No database code here: the storage
// operations come in as a ProvisionRepo (helpers/salesBrainProvisionDb.tsx in production, an
// in-memory one in the tests), so the rules below are tested as they run.
//
// account.provision: find the account (Sales Brain customer id, then the owner's email) or create
//   it; put it on the free included plan; stop any paid subscription; invite a new owner.
// account.access_ended: from ends_at, take it off the free plan; the account and data stay.
// Each event id is processed once; a repeat returns the stored result.

/** A problem with the data Sales Brain sent (400; resending won't help until it's fixed). */
export class DataError extends Error {}

export type BizRef = {
  id: number;
  comp: boolean;
  compSource: string | null;
  compEndsAt: Date | null;
  salesBrainCustomerId: string | null;
};

/** Operations inside one database transaction. */
export interface ProvisionTx {
  lock(key: string): Promise<void>;
  byCustomerId(customerId: string): Promise<BizRef | null>;
  byId(id: number): Promise<BizRef | null>;
  /** The business the user with this email belongs to, and their role there. */
  memberByEmail(email: string): Promise<{ biz: BizRef; role: string } | null>;
  createWorkspace(authId: string, rows: WorkspaceRows): Promise<number>;
  /** Free included plan: no card, no trial end, no charges; stores the Sales Brain customer id. */
  include(businessId: number, customerId: string, salesBrainPlan: string): Promise<void>;
  /** From endsAt, off the free plan (now if endsAt has passed). */
  endAccess(businessId: number, endsAt: Date, now: Date): Promise<void>;
  /** Queue account.upserted to Sales Brain (same transaction). */
  queueSync(businessId: number): Promise<void>;
}

export interface ProvisionRepo {
  processed(eventId: string): Promise<EventResult | null>;
  read<T>(fn: (tx: ProvisionTx) => Promise<T>): Promise<T>;
  /** Runs fn in a transaction held per event id and stores its result. A result stored meanwhile wins. */
  commit(eventId: string, type: string, fn: (tx: ProvisionTx) => Promise<EventResult>): Promise<EventResult>;
  hasActiveSubscription(businessId: number): Promise<boolean>;
  /** Ends the paid subscription now, with no further charges. */
  stopBilling(businessId: number): Promise<void>;
  /** The login for this email, created (no password yet) if there isn't one. */
  ensureLogin(email: string, displayName: string): Promise<{ authId: string; isNew: boolean }>;
  /** The app's normal owner invite email (create login / choose a password). */
  sendOwnerInvite(businessId: number, email: string, ownerName: string, businessName: string): Promise<void>;
  now(): Date;
  log(message: string, detail?: unknown): void;
}

// ---------- new workspace ----------

export type WorkspaceRows = {
  email: string;
  displayName: string;
  business: { name: string; trade: string };
  settings: {
    owner: { first: string; last: string; role: string; email: string; phone: string };
    business: { name: string; abn: string; phone: string; email: string; address: string; website: string; area: string; googleProfile: string };
  };
  services: { name: string; price: number; freq: string }[];
};

/** Everything a new workspace starts with, from Sales Brain's details. */
export function workspaceRows(d: ProvisionData): WorkspaceRows {
  const trade = tradeKey(d.trade);
  const owner = splitName(d.owner_name);
  return {
    email: d.email,
    displayName: d.owner_name || d.business_name,
    business: { name: d.business_name, trade },
    settings: {
      owner: { first: owner.first, last: owner.last, role: "Owner", email: d.email, phone: d.phone },
      business: {
        name: d.business_name,
        abn: d.abn,
        phone: d.phone,
        email: d.email,
        address: d.address,
        website: d.website,
        area: d.service_areas.join(", "),
        googleProfile: d.google_profile,
      },
    },
    services: starterServices(trade, d.services),
  };
}

// ---------- events ----------

async function findForProvision(tx: ProvisionTx, d: ProvisionData): Promise<BizRef | null> {
  const linked = await tx.byCustomerId(d.sales_brain_customer_id);
  if (linked) return linked;
  const m = await tx.memberByEmail(d.email);
  if (!m) return null;
  if (m.role !== "owner") {
    throw new DataError(`${d.email} is already a team member of another business, so it can't own an account. Use the owner's own email.`);
  }
  if (m.biz.salesBrainCustomerId && m.biz.salesBrainCustomerId !== d.sales_brain_customer_id) {
    throw new DataError(`The account for ${d.email} (${m.biz.id}) is linked to another Sales Brain customer, ${m.biz.salesBrainCustomerId}`);
  }
  return m.biz;
}

async function provision(repo: ProvisionRepo, id: string, d: ProvisionData): Promise<EventResult> {
  // Outside the transaction: Stripe and Supabase Auth calls. Both are safe to repeat on a retry.
  const existing = await repo.read((tx) => findForProvision(tx, d));
  if (existing && (await repo.hasActiveSubscription(existing.id))) await repo.stopBilling(existing.id);
  const login = existing ? null : await repo.ensureLogin(d.email, d.owner_name || d.business_name);
  const rows = workspaceRows(d);

  let created = false;
  const result = await repo.commit(id, "account.provision", async (tx) => {
    await tx.lock(`sb-customer:${d.sales_brain_customer_id}`);
    created = false;
    let biz = await findForProvision(tx, d);
    if (!biz) {
      if (!login) throw new Error("The account changed while provisioning; retry");
      const businessId = await tx.createWorkspace(login.authId, rows);
      biz = { id: businessId, comp: false, compSource: null, compEndsAt: null, salesBrainCustomerId: null };
      created = true;
    }
    await tx.include(biz.id, d.sales_brain_customer_id, d.plan);
    await tx.queueSync(biz.id);
    return { id, account_id: String(biz.id), status: created ? "created" : "linked" };
  });

  if ("error" in result) return result;
  const businessId = Number(result.account_id);
  if (created) {
    await repo.sendOwnerInvite(businessId, d.email, d.owner_name, d.business_name).catch((e) => repo.log("owner invite failed", e));
  } else if (await repo.hasActiveSubscription(businessId).catch(() => false)) {
    // Found only inside the transaction (a race): still make sure they aren't charged.
    await repo.stopBilling(businessId).catch((e) => repo.log("stop billing failed", e));
  }
  return result;
}

async function accessEnded(repo: ProvisionRepo, id: string, d: AccessEndedData): Promise<EventResult> {
  return repo.commit(id, "account.access_ended", async (tx) => {
    await tx.lock(`sb-customer:${d.sales_brain_customer_id}`);
    let biz = await tx.byCustomerId(d.sales_brain_customer_id);
    if (biz && d.account_id && String(biz.id) !== d.account_id) {
      throw new DataError(`account_id ${d.account_id} isn't the account linked to this customer (${biz.id})`);
    }
    if (!biz && d.account_id) {
      const byId = await tx.byId(Number(d.account_id));
      if (!byId) throw new DataError(`No account ${d.account_id}`);
      if (byId.salesBrainCustomerId !== d.sales_brain_customer_id) throw new DataError(`Account ${d.account_id} isn't linked to this Sales Brain customer`);
      biz = byId;
    }
    if (!biz) throw new DataError("No account is linked to this Sales Brain customer");
    if (biz.comp && biz.compSource !== "salesbrain") {
      throw new DataError(`Free access on account ${biz.id} was given by Local Service Pro staff, not Sales Brain`);
    }
    await tx.endAccess(biz.id, d.ends_at, repo.now());
    await tx.queueSync(biz.id);
    return { id, account_id: String(biz.id), status: "ended" };
  });
}

async function processOne(repo: ProvisionRepo, ev: InboundEvent): Promise<EventResult> {
  const done = await repo.processed(ev.id);
  if (done) return done;
  return ev.type === "account.provision" ? provision(repo, ev.id, ev.data) : accessEnded(repo, ev.id, ev.data);
}

/** Handles a signed request body. Returns the HTTP status and the reply. */
export async function processInbound(repo: ProvisionRepo, raw: string): Promise<{ status: number; body: { results: EventResult[]; error?: string } }> {
  const batch = parseBatch(raw);
  if (batch.fatal) return { status: 400, body: { results: [], error: batch.fatal } };
  const results: EventResult[] = [];
  let transient = false;
  for (const item of batch.items) {
    if (!item.ok) {
      results.push(item.result);
      continue;
    }
    try {
      results.push(await processOne(repo, item.event));
    } catch (e) {
      if (e instanceof DataError) {
        results.push({ id: item.event.id, error: e.message });
      } else {
        transient = true;
        repo.log(`${item.event.type} ${item.event.id} failed`, e);
        results.push({ id: item.event.id, error: "Temporary problem on our side. Send it again later." });
      }
    }
  }
  return { status: batchStatus(results, transient), body: { results } };
}

export { INCLUDED_PLAN };
