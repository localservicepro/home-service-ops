import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { INCLUDED_PLAN_NAME, signPayload } from "./salesBrainEvents";
import { TRADES, type TradeKey } from "./tradeTemplates";

// Server-only, no I/O: what Sales Brain sends to POST /api/integrations/sales-brain.
// Signed like our calls to Sales Brain: x-lsp-timestamp (unix seconds, within 5 minutes) and
// x-lsp-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with LSP_APP_SHARED_SECRET>.

export const MAX_SKEW_S = 300;
export const MAX_EVENTS = 500;
/** The free plan Sales Brain clients get. Shown in the app and sent back as `plan`. */
export const INCLUDED_PLAN = INCLUDED_PLAN_NAME;

export function verifySignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  now = Date.now(),
): { ok: true } | { ok: false; error: string } {
  if (!timestamp || !/^\d{9,11}$/.test(timestamp.trim())) return { ok: false, error: "Missing or invalid x-lsp-timestamp" };
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > MAX_SKEW_S) return { ok: false, error: "Timestamp is more than 5 minutes off" };
  const m = /^sha256=([0-9a-f]{64})$/i.exec(signature?.trim() ?? "");
  if (!m) return { ok: false, error: "Missing or invalid x-lsp-signature" };
  const expected = Buffer.from(signPayload(secret, timestamp.trim(), rawBody), "hex");
  const given = Buffer.from(m[1].toLowerCase(), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, error: "Signature doesn't match" };
  return { ok: true };
}

// ---------- events ----------

const str = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || "");
const list = z
  .array(z.string().trim().min(1).max(120))
  .max(100)
  .nullish()
  .transform((v) => [...new Set(v ?? [])]);

export const provisionData = z.object({
  sales_brain_customer_id: z.string().uuid(),
  business_name: z.string().trim().min(1, "business_name is required").max(200),
  owner_name: str(200),
  email: z.string().trim().toLowerCase().email("email isn't a valid email address").max(254),
  phone: str(40),
  abn: str(20),
  address: str(300),
  trade: str(100),
  services: list,
  service_areas: list,
  website: str(300),
  google_profile: str(500),
  plan: str(100),
  access: z.literal("included", { errorMap: () => ({ message: 'access must be "included"' }) }),
});
export type ProvisionData = z.infer<typeof provisionData>;

export const accessEndedData = z.object({
  sales_brain_customer_id: z.string().uuid(),
  account_id: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v == null || v === "" ? null : String(v)))
    .refine((v) => v === null || /^\d+$/.test(v), "account_id must be this app's account id"),
  email: z.string().trim().toLowerCase().email().max(254).nullish().catch(null),
  ends_at: z.string().datetime({ offset: true, message: "ends_at must be an ISO date-time" }).transform((v) => new Date(v)),
});
export type AccessEndedData = z.infer<typeof accessEndedData>;

export type InboundEvent =
  | { id: string; type: "account.provision"; data: ProvisionData }
  | { id: string; type: "account.access_ended"; data: AccessEndedData };

/** One result per event, in the order sent. */
export type EventResult =
  | { id: string; account_id: string; status: "created" | "linked" | "ended" }
  | { id: string; error: string };

const issues = (e: z.ZodError) => e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");

/**
 * Splits the body into events that can be processed and per-event errors.
 * `fatal` is set when the body itself is unusable (no results can be given per event).
 */
export function parseBatch(raw: string): { fatal?: string; items: ({ ok: true; event: InboundEvent } | { ok: false; result: EventResult })[] } {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { fatal: "Body isn't valid JSON", items: [] };
  }
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return { fatal: 'Body must be { "events": [ ... ] }', items: [] };
  if (events.length === 0) return { fatal: "No events", items: [] };
  if (events.length > MAX_EVENTS) return { fatal: `At most ${MAX_EVENTS} events per request`, items: [] };
  return {
    items: events.map((e, i) => {
      const ev = (e ?? {}) as { id?: unknown; type?: unknown; data?: unknown };
      const id = typeof ev.id === "string" && ev.id.trim() ? ev.id.trim().slice(0, 200) : "";
      if (!id) return { ok: false as const, result: { id: typeof ev.id === "string" ? ev.id : `#${i}`, error: "id is required" } };
      if (ev.type === "account.provision") {
        const r = provisionData.safeParse(ev.data);
        return r.success ? { ok: true as const, event: { id, type: ev.type, data: r.data } } : { ok: false as const, result: { id, error: issues(r.error) } };
      }
      if (ev.type === "account.access_ended") {
        const r = accessEndedData.safeParse(ev.data);
        return r.success ? { ok: true as const, event: { id, type: ev.type, data: r.data } } : { ok: false as const, result: { id, error: issues(r.error) } };
      }
      return { ok: false as const, result: { id, error: `Unknown event type ${JSON.stringify(ev.type ?? null)}` } };
    }),
  };
}

/** 200 when every event worked, 503 if any hit a problem on our side (retry), else 400. */
export function batchStatus(results: EventResult[], transient: boolean): number {
  if (transient) return 503;
  return results.some((r) => "error" in r) ? 400 : 200;
}

// ---------- workspace details ----------

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, " ").trim();
const TRADE_WORDS: [TradeKey, RegExp][] = [
  ["lawn", /\b(lawn|garden|mow|landscap|yard)/],
  ["cleaning", /\b(clean|maid|housekeep)/],
  ["pressure", /\b(pressure|soft wash|power wash|exterior wash)/],
  ["pest", /\b(pest|termite|exterminat)/],
  ["pool", /\b(pool|spa)\b/],
  ["handyman", /\b(handy|maintenance|repair|odd job)/],
];

/** Sales Brain's free-text trade → this app's trade key ("other" when nothing fits). */
export function tradeKey(trade: string): TradeKey {
  const t = norm(trade);
  if (!t) return "other";
  const exact = TRADES.find((x) => norm(x.label) === t || x.key === t);
  if (exact) return exact.key;
  return TRADE_WORDS.find(([, re]) => re.test(t))?.[0] ?? "other";
}

/** Services to add for a new workspace: Sales Brain's names, priced from the trade's starter list when the name matches. */
export function starterServices(trade: TradeKey, names: string[]) {
  const starters = TRADES.find((t) => t.key === trade)?.services ?? [];
  return names.map((name) => {
    const s = starters.find((x) => norm(x.name) === norm(name));
    return { name, price: s?.price ?? 0, freq: s?.freq ?? "One-time" };
  });
}

export const splitName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { first: first ?? "", last: rest.join(" ") };
};
