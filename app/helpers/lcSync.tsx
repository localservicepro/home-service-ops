import { createPublicKey, verify } from "node:crypto";
import { db } from "./db";
import { lcFetch } from "./leadConnector";
import { getBilling } from "./billing";
import { PLANS } from "./plans";
import { ensureClient } from "./ensureClient";
import { copyRemoteFile } from "./storage";
import type { JobStatus, QuoteStatus } from "./schema";
import { STAGE_KEYS, type StageKey, type StageMap } from "./lcStages";

// Server-only. Two-way link between the app and each business's LeadConnector sub-account:
//  - leads in: new opportunities in the chosen pipeline become job requests
//  - stages out: as work moves along, its opportunity moves to the mapped stage
// Nothing here throws to callers that save jobs/quotes: a CRM hiccup never blocks the app.

const RANK: Record<StageKey, number> = { new: 0, quoted: 1, booked: 2, done: 3, paid: 4, lost: -1 };
const IMPORT_EVERY_MS = 2 * 60 * 1000;

export type Conn = {
  businessId: number;
  locationId: string;
  pipelineId: string | null;
  stageMap: StageMap;
  importLeads: boolean;
  pushNew: boolean;
  importAfter: Date | null;
  connectedAt: Date;
};

export function jobStageKey(s: JobStatus): StageKey {
  return ({ New: "new", "Quote Sent": "quoted", "Job Scheduled": "booked", "In Progress": "booked", Done: "done", Paid: "paid", Cancelled: "lost" } as const)[s];
}
export function quoteStageKey(s: QuoteStatus): StageKey | null {
  return s === "Declined" ? "lost" : s === "Converted" ? null : "quoted";
}

function readMap(v: unknown): StageMap {
  const out: StageMap = {};
  if (v && typeof v === "object") for (const k of STAGE_KEYS) {
    const id = (v as Record<string, unknown>)[k];
    if (typeof id === "string" && id) out[k] = id;
  }
  return out;
}

async function loadConn(businessId: number): Promise<Conn | null> {
  const c = await db.selectFrom("lcConnection").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!c) return null;
  return { ...c, stageMap: readMap(c.stageMap) };
}

/** Pipeline configured and the business's plan includes LeadConnector. */
async function activeConn(businessId: number) {
  const c = await loadConn(businessId);
  if (!c || !c.pipelineId) return null;
  const b = await getBilling(businessId);
  if (b.readOnly || !PLANS[b.plan].leadConnector) return null;
  return c;
}

async function lcJson<T>(businessId: number, path: string, init?: RequestInit): Promise<T> {
  const res = await lcFetch(businessId, path, init);
  const j = (await res.json().catch(() => ({}))) as { message?: string | string[]; error?: string };
  if (!res.ok) {
    const m = Array.isArray(j.message) ? j.message.join(", ") : j.message || j.error;
    throw new Error(m ? `LeadConnector: ${m}` : `LeadConnector error ${res.status}`);
  }
  return j as T;
}

async function noteResult(businessId: number, error: string | null) {
  await db.updateTable("lcConnection").set({ lastSyncAt: new Date(), lastSyncError: error }).where("businessId", "=", businessId).execute().catch(() => undefined);
}

// ---------- pipelines ----------

export type Pipeline = { id: string; name: string; stages: { id: string; name: string }[] };

export async function listPipelines(businessId: number): Promise<Pipeline[]> {
  const c = await loadConn(businessId);
  if (!c) throw new Error("LeadConnector isn't connected.");
  const j = await lcJson<{ pipelines?: { id: string; name: string; stages?: { id: string; name: string; position?: number }[] }[] }>(
    businessId,
    `/opportunities/pipelines?locationId=${encodeURIComponent(c.locationId)}`,
  );
  return (j.pipelines ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: [...(p.stages ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((s) => ({ id: s.id, name: s.name })),
  }));
}

// ---------- leads in ----------

type Opp = {
  id: string;
  name?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string;
  contactId?: string;
  monetaryValue?: number;
  source?: string;
  createdAt?: string;
  dateAdded?: string;
  contact?: { id?: string; name?: string; email?: string; phone?: string };
  customFields?: RawField[];
};
type RawField = { id?: string; value?: unknown; fieldValue?: unknown } & Record<string, unknown>;
type Contact = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  customFields?: RawField[];
};

// ---------- lead details (custom fields, notes, files) ----------

export type CustomField = { label: string; value: string };
type FieldDef = { name: string; position: number; dataType: string };
const defCache = new Map<number, { at: number; defs: Map<string, FieldDef> }>();

/** Names of the sub-account's custom fields (contact and opportunity). Needs locations/customFields.readonly. */
async function fieldDefs(c: Conn): Promise<Map<string, FieldDef>> {
  const hit = defCache.get(c.businessId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.defs;
  const defs = new Map<string, FieldDef>();
  try {
    const r = await lcJson<{ customFields?: { id: string; name?: string; position?: number; dataType?: string }[] }>(
      c.businessId,
      `/locations/${encodeURIComponent(c.locationId)}/customFields?model=all`,
    );
    for (const f of r.customFields ?? []) defs.set(f.id, { name: f.name || "Custom field", position: f.position ?? 0, dataType: f.dataType ?? "" });
  } catch (e) {
    console.warn("LeadConnector custom field names unavailable", c.businessId, e instanceof Error ? e.message : e);
  }
  defCache.set(c.businessId, { at: Date.now(), defs });
  return defs;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)(\?|#|$)/i;

/** Splits a raw custom field value into display text and any file links it holds. */
export function readLcFieldValue(raw: RawField): { text: string; files: { url: string; name: string; image: boolean }[] } {
  const v =
    raw.fieldValue ?? raw.value ?? raw.fieldValueString ?? raw.fieldValueNumber ?? raw.fieldValueArray ?? raw.fieldValueFiles ?? raw.fieldValueDate ?? raw.fieldValueBoolean;
  const files: { url: string; name: string; image: boolean }[] = [];
  const walk = (x: unknown): string[] => {
    if (x == null || x === "") return [];
    if (typeof x === "string") {
      if (/^https?:\/\//i.test(x.trim()) && /\/(files|uploads?|attachments?)\//i.test(x)) {
        files.push({ url: x.trim(), name: x.split("/").pop()?.split("?")[0] ?? "file", image: IMAGE_EXT.test(x) });
        return [];
      }
      return [x.trim()];
    }
    if (typeof x === "number" || typeof x === "boolean") return [String(x)];
    if (Array.isArray(x)) return x.flatMap(walk);
    if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.url === "string") {
        const meta = (o.meta ?? {}) as { name?: string; mimetype?: string; originalname?: string };
        const name = meta.originalname || meta.name || o.url.split("/").pop()?.split("?")[0] || "file";
        files.push({ url: o.url, name, image: (meta.mimetype ?? "").startsWith("image/") || IMAGE_EXT.test(name) || IMAGE_EXT.test(o.url) });
        return [];
      }
      return Object.values(o).flatMap(walk);
    }
    return [];
  };
  const text = walk(v).filter(Boolean).join(", ").slice(0, 2000);
  return { text, files };
}

/** Custom fields, notes and photos to store on a lead imported from LeadConnector. */
export async function leadDetails(c: Conn, opp: Opp, contact: Partial<Contact>) {
  const defs = await fieldDefs(c);
  const fields: (CustomField & { pos: number })[] = [];
  const photos: string[] = [];
  const raw = [...(contact.customFields ?? []), ...(opp.customFields ?? [])];
  let n = 0;
  for (const f of raw) {
    if (!f?.id) continue;
    const def = defs.get(f.id);
    const { text, files } = readLcFieldValue(f);
    const links: string[] = [];
    for (const file of files.slice(0, 10)) {
      const copied = await copyRemoteFile(file.url, `job-photos/${c.businessId}/lc-${opp.id}-${n++}`, { imagesOnly: file.image });
      if (file.image && copied) photos.push(copied);
      else links.push(copied ?? file.url);
    }
    const value = [text, ...links].filter(Boolean).join("\n");
    if (value) fields.push({ label: (def?.name ?? "Custom field").slice(0, 100), value: value.slice(0, 2000), pos: def?.position ?? 999 });
  }
  fields.sort((a, b) => a.pos - b.pos);

  let notes: string[] = [];
  if (opp.contactId) {
    try {
      const r = await lcJson<{ notes?: { body?: string; dateAdded?: string }[] }>(c.businessId, `/contacts/${encodeURIComponent(opp.contactId)}/notes`);
      notes = (r.notes ?? [])
        .sort((a, b) => Date.parse(a.dateAdded ?? "") - Date.parse(b.dateAdded ?? ""))
        .map((x) => (x.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").trim())
        .filter(Boolean);
    } catch {
      /* notes are a nice-to-have */
    }
  }
  return { customFields: fields.map(({ label, value }) => ({ label, value })), photos: photos.slice(0, 40), notes };
}

/** Turns one opportunity into a job request. Returns true if it was new to the app. */
async function importOpportunity(c: Conn, opp: Opp): Promise<boolean> {
  if (!opp.id || opp.pipelineId !== c.pipelineId || (opp.status && opp.status !== "open")) return false;
  const stageKey = (Object.entries(c.stageMap).find(([, id]) => id === opp.pipelineStageId)?.[0] as StageKey | undefined) ?? "new";
  // Claim it first so a webhook and a sync running together can't both import it.
  const claimed = await db
    .insertInto("lcOpportunities")
    .values({ businessId: c.businessId, opportunityId: opp.id, contactId: opp.contactId ?? null, stageKey })
    .onConflict((oc) => oc.columns(["businessId", "opportunityId"]).doNothing())
    .returning("opportunityId")
    .executeTakeFirst();
  if (!claimed) return false;

  try {
    let ct: Partial<Contact> = {};
    if (opp.contactId) {
      try {
        ct = (await lcJson<{ contact: Contact }>(c.businessId, `/contacts/${encodeURIComponent(opp.contactId)}`)).contact ?? {};
      } catch {
        /* fall back to what the opportunity carries */
      }
    }
    const name =
      (ct.name || [ct.firstName, ct.lastName].filter(Boolean).join(" ") || ct.companyName || opp.contact?.name || opp.name || "New lead").trim().slice(0, 200);
    const phone = (ct.phone || opp.contact?.phone || "").trim();
    const email = (ct.email || opp.contact?.email || "").trim().toLowerCase();
    const address = [ct.address1, ct.city, ct.state, ct.postalCode].filter(Boolean).join(", ").slice(0, 300);
    const oppName = (opp.name || "").trim();
    const service = oppName && oppName.toLowerCase() !== name.toLowerCase() ? oppName.slice(0, 300) : "";
    // Search results can leave out custom fields; read the full opportunity when they're missing.
    let full = opp;
    if (!opp.customFields) {
      full = (await lcJson<{ opportunity?: Opp }>(c.businessId, `/opportunities/${encodeURIComponent(opp.id)}`).catch(() => null))?.opportunity ?? opp;
    }
    const extra = await leadDetails(c, { ...full, id: opp.id, contactId: opp.contactId ?? full.contactId }, ct);
    const intro = `New lead from LeadConnector${opp.source ? ` (${opp.source})` : ""}.`;
    const notes = [intro, ...(extra.notes.length ? ["", "Notes from LeadConnector:", ...extra.notes.map((x) => `• ${x}`)] : [])].join("\n").slice(0, 4000);

    await db.transaction().execute(async (trx) => {
      const known = opp.contactId
        ? await trx.selectFrom("clients").select("id").where("businessId", "=", c.businessId).where("lcContactId", "=", opp.contactId).executeTakeFirst()
        : undefined;
      const clientId = await ensureClient(trx, c.businessId, { clientId: known?.id ?? null, name, address, phone, email });
      await trx.updateTable("clients").set({ lcContactId: opp.contactId ?? null }).where("id", "=", clientId).where("lcContactId", "is", null).execute();
      if (email) await trx.updateTable("clients").set({ email }).where("id", "=", clientId).where("email", "=", "").execute();
      await trx
        .insertInto("jobs")
        .values({
          businessId: c.businessId,
          clientId,
          customer: name,
          address,
          phone,
          service,
          status: "New",
          price: Number(opp.monetaryValue) || 0,
          source: "leadconnector",
          notes,
          customFields: extra.customFields,
          photos: extra.photos,
          lcOpportunityId: opp.id,
          lcContactId: opp.contactId ?? null,
        })
        .execute();
    });
    return true;
  } catch (e) {
    // Release the claim so the next sync can try again.
    await db.deleteFrom("lcOpportunities").where("businessId", "=", c.businessId).where("opportunityId", "=", opp.id).execute().catch(() => undefined);
    throw e;
  }
}

/** Pulls recent opportunities from the chosen pipeline. Throttled unless forced. */
export async function pullLeads(businessId: number, opts: { force?: boolean } = {}) {
  const c = await activeConn(businessId);
  if (!c || !c.importLeads) return { imported: 0, skipped: true as const };
  // Claim this run (also the throttle), so parallel requests don't pull twice.
  const due = new Date(Date.now() - (opts.force ? 5_000 : IMPORT_EVERY_MS));
  const claim = await db
    .updateTable("lcConnection")
    .set({ lastImportAt: new Date() })
    .where("businessId", "=", businessId)
    .where((eb) => eb.or([eb("lastImportAt", "is", null), eb("lastImportAt", "<", due)]))
    .returning("businessId")
    .executeTakeFirst();
  if (!claim) return { imported: 0, skipped: true as const };

  const since = (c.importAfter ?? c.connectedAt).getTime();
  let imported = 0;
  try {
    let page: { startAfter?: string | number; startAfterId?: string } = {};
    for (let i = 0; i < 5; i++) {
      const q = new URLSearchParams({ location_id: c.locationId, pipeline_id: c.pipelineId!, status: "open", limit: "100" });
      if (page.startAfter) q.set("startAfter", String(page.startAfter));
      if (page.startAfterId) q.set("startAfterId", page.startAfterId);
      const r = await lcJson<{ opportunities?: Opp[]; meta?: { startAfter?: number | string; startAfterId?: string; nextPageUrl?: string | null } }>(
        businessId,
        `/opportunities/search?${q}`,
      );
      for (const opp of r.opportunities ?? []) {
        const created = Date.parse(opp.createdAt ?? opp.dateAdded ?? "");
        if (Number.isFinite(created) && created < since) continue;
        if (await importOpportunity(c, opp)) imported++;
      }
      if (!r.meta?.nextPageUrl || !r.meta.startAfterId || (r.opportunities ?? []).length === 0) break;
      page = { startAfter: r.meta.startAfter, startAfterId: r.meta.startAfterId };
    }
    await noteResult(businessId, null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("LeadConnector lead import failed", businessId, msg);
    await noteResult(businessId, msg);
    return { imported, skipped: false as const, error: msg };
  }
  return { imported, skipped: false as const };
}

// ---------- stages out ----------

async function moveOpp(c: Conn, oppId: string, key: StageKey, value: number) {
  const stageId = c.stageMap[key];
  if (!stageId) return;
  const row = await db
    .selectFrom("lcOpportunities")
    .select("stageKey")
    .where("businessId", "=", c.businessId)
    .where("opportunityId", "=", oppId)
    .executeTakeFirst();
  const cur = row?.stageKey as StageKey | undefined;
  if (cur === key) return;
  // Only move forward (or to lost, or back out of lost), so an old record can't drag a deal backwards.
  const allowed = key === "lost" ? cur !== "paid" : !cur || cur === "lost" || RANK[key] > RANK[cur];
  if (!allowed) return;
  await lcJson(c.businessId, `/opportunities/${encodeURIComponent(oppId)}`, {
    method: "PUT",
    body: JSON.stringify({
      pipelineId: c.pipelineId,
      pipelineStageId: stageId,
      status: key === "paid" ? "won" : key === "lost" ? "lost" : "open",
      ...(value > 0 ? { monetaryValue: value } : {}),
    }),
  });
  await db
    .insertInto("lcOpportunities")
    .values({ businessId: c.businessId, opportunityId: oppId, stageKey: key })
    .onConflict((oc) => oc.columns(["businessId", "opportunityId"]).doUpdateSet({ stageKey: key, updatedAt: new Date() }))
    .execute();
}

/** Creates (or finds) the contact and a new opportunity for work that started in the app. */
async function createOpp(
  c: Conn,
  key: StageKey,
  who: { name: string; phone: string; email: string; address: string; clientId: number | null; service: string; value: number },
) {
  const stageId = c.stageMap[key];
  if (!stageId || !c.pushNew || key === "lost") return null;
  if (!who.phone && !who.email) return null; // LeadConnector needs one to avoid duplicate contacts
  const [firstName, ...rest] = who.name.trim().split(/\s+/);
  const up = await lcJson<{ contact?: { id: string } }>(c.businessId, `/contacts/upsert`, {
    method: "POST",
    body: JSON.stringify({
      locationId: c.locationId,
      name: who.name,
      firstName,
      lastName: rest.join(" ") || undefined,
      ...(who.phone ? { phone: who.phone } : {}),
      ...(who.email ? { email: who.email } : {}),
      ...(who.address ? { address1: who.address } : {}),
      source: "Home Service Ops",
    }),
  });
  const contactId = up.contact?.id;
  if (!contactId) throw new Error("LeadConnector didn't return a contact");
  const created = await lcJson<{ opportunity?: { id: string } }>(c.businessId, `/opportunities/`, {
    method: "POST",
    body: JSON.stringify({
      locationId: c.locationId,
      pipelineId: c.pipelineId,
      pipelineStageId: stageId,
      name: `${who.service || "Job"} — ${who.name}`.slice(0, 200),
      status: key === "paid" ? "won" : "open",
      contactId,
      ...(who.value > 0 ? { monetaryValue: who.value } : {}),
      source: "Home Service Ops",
    }),
  });
  const oppId = created.opportunity?.id;
  if (!oppId) throw new Error("LeadConnector didn't return an opportunity");
  await db
    .insertInto("lcOpportunities")
    .values({ businessId: c.businessId, opportunityId: oppId, contactId, stageKey: key })
    .onConflict((oc) => oc.columns(["businessId", "opportunityId"]).doNothing())
    .execute();
  if (who.clientId) {
    await db.updateTable("clients").set({ lcContactId: contactId }).where("id", "=", who.clientId).where("lcContactId", "is", null).execute();
  }
  return { oppId, contactId };
}

/** Push the current stage of these jobs/quotes to LeadConnector. Never throws. */
export async function pushToLc(businessId: number, ids: { jobIds?: number[]; quoteIds?: number[] }) {
  try {
    const c = await activeConn(businessId);
    if (!c) return;
    let lastError: string | null = null;
    const emailOf = async (clientId: number | null) =>
      clientId ? (await db.selectFrom("clients").select("email").where("id", "=", clientId).executeTakeFirst())?.email ?? "" : "";

    for (const id of ids.jobIds ?? []) {
      try {
        const j = await db.selectFrom("jobs").selectAll().where("id", "=", id).where("businessId", "=", businessId).executeTakeFirst();
        if (!j) continue;
        const key = jobStageKey(j.status);
        if (j.lcOpportunityId) {
          await moveOpp(c, j.lcOpportunityId, key, Number(j.price));
        } else if (key !== "lost") {
          const made = await createOpp(c, key, {
            name: j.customer,
            phone: j.phone,
            email: await emailOf(j.clientId),
            address: j.address,
            clientId: j.clientId,
            service: j.service,
            value: Number(j.price),
          });
          if (made) await db.updateTable("jobs").set({ lcOpportunityId: made.oppId, lcContactId: made.contactId }).where("id", "=", j.id).execute();
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("LeadConnector push failed for job", id, lastError);
      }
    }

    for (const id of ids.quoteIds ?? []) {
      try {
        const q = await db.selectFrom("quotes").selectAll().where("id", "=", id).where("businessId", "=", businessId).executeTakeFirst();
        if (!q) continue;
        const key = quoteStageKey(q.status);
        if (!key) continue;
        if (q.lcOpportunityId) {
          await moveOpp(c, q.lcOpportunityId, key, Number(q.price));
        } else if (key !== "lost") {
          const client = q.clientId ? await db.selectFrom("clients").select(["phone", "email"]).where("id", "=", q.clientId).executeTakeFirst() : undefined;
          const made = await createOpp(c, key, {
            name: q.customer,
            phone: client?.phone ?? "",
            email: q.sentTo || client?.email || "",
            address: q.address,
            clientId: q.clientId,
            service: q.service,
            value: Number(q.price),
          });
          if (made) await db.updateTable("quotes").set({ lcOpportunityId: made.oppId }).where("id", "=", q.id).execute();
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("LeadConnector push failed for quote", id, lastError);
      }
    }
    await noteResult(businessId, lastError);
  } catch (e) {
    console.error("LeadConnector push failed", e instanceof Error ? e.message : e);
  }
}

// ---------- webhooks ----------

// LeadConnector's published Ed25519 key for the X-GHL-Signature header.
const GHL_PUBLIC_KEY = createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`);

export function verifyLcWebhook(raw: string, signature: string | null) {
  if (!signature) return false;
  try {
    return verify(null, Buffer.from(raw, "utf8"), GHL_PUBLIC_KEY, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export async function handleLcWebhook(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
  const evt = { ...payload, ...data } as Record<string, unknown>;
  const type = String(evt.type ?? payload.type ?? "");
  const locationId = typeof evt.locationId === "string" ? evt.locationId : null;
  if (!locationId) return "no location";
  const conns = await db.selectFrom("lcConnection").select("businessId").where("locationId", "=", locationId).execute();
  if (!conns.length) return "unknown location";

  if (type === "UNINSTALL") {
    await db.deleteFrom("lcConnection").where("locationId", "=", locationId).execute();
    return "uninstalled";
  }
  if (type !== "OpportunityCreate") return "ignored";
  const oppId = typeof evt.id === "string" ? evt.id : null;
  if (!oppId) return "no opportunity";

  let imported = 0;
  for (const { businessId } of conns) {
    const c = await activeConn(businessId);
    if (!c || !c.importLeads) continue;
    // Read the opportunity from the API rather than trusting the payload.
    const r = await lcJson<{ opportunity?: Opp }>(businessId, `/opportunities/${encodeURIComponent(oppId)}`);
    const opp = r.opportunity;
    if (opp && (await importOpportunity(c, { ...opp, id: opp.id ?? oppId }))) imported++;
  }
  return imported ? "imported" : "not in pipeline";
}
