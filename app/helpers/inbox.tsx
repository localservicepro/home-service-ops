import { db } from "./db";
import { smsApi, toE164 } from "./sms";

// Server-only. The team inbox: texts to and from the business's SMS Gateway (myCRMSIM)
// workspace, grouped into one conversation per phone number and matched to clients.
// Read state is shared by the whole business (hso.inbox_reads).

export type GatewayMessage = {
  id: number | string;
  channel?: string | null;
  direction?: "inbound" | "outbound" | string | null;
  to?: string | null;
  from?: string | null;
  text?: string | null;
  media?: { url?: string; type?: string }[] | null;
  status?: string | null;
  created_at?: string | null;
};

export type InboxMessage = {
  id: string;
  direction: "in" | "out";
  text: string;
  media: { url: string; type: string }[];
  status: string;
  channel: string;
  at: string | null;
};

export type InboxThread = {
  phone: string;
  clientId: number | null;
  name: string | null;
  lastText: string;
  lastDirection: "in" | "out";
  lastAt: string | null;
  unread: number;
};

/** The other party's number on a message, in +61… form. */
export function counterpart(m: GatewayMessage): string | null {
  const raw = m.direction === "inbound" ? m.from : m.to;
  return raw ? toE164(raw) : null;
}

export function toInboxMessage(m: GatewayMessage): InboxMessage {
  const media = (m.media ?? []).filter((x): x is { url: string; type?: string } => !!x?.url).map((x) => ({ url: x.url, type: x.type ?? "" }));
  return {
    id: String(m.id),
    direction: m.direction === "inbound" ? "in" : "out",
    text: (m.text ?? "").trim() || (media.length ? "📎 Attachment" : ""),
    media,
    status: m.status ?? "",
    channel: m.channel ?? "sms",
    at: m.created_at ?? null,
  };
}

const ts = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);

/** One conversation per phone, newest first. Unread = their texts since the last read. */
export function groupThreads(
  msgs: GatewayMessage[],
  reads: Map<string, number>,
  clients: Map<string, { id: number; name: string }>,
): InboxThread[] {
  const by = new Map<string, InboxThread>();
  for (const m of msgs) {
    const phone = counterpart(m);
    if (!phone) continue;
    const msg = toInboxMessage(m);
    const at = ts(msg.at);
    let t = by.get(phone);
    if (!t) {
      const c = clients.get(phone);
      t = { phone, clientId: c?.id ?? null, name: c?.name ?? null, lastText: "", lastDirection: msg.direction, lastAt: null, unread: 0 };
      by.set(phone, t);
    }
    if (!t.lastAt || at > ts(t.lastAt)) {
      t.lastText = msg.text;
      t.lastDirection = msg.direction;
      t.lastAt = msg.at;
    }
    if (msg.direction === "in" && at > (reads.get(phone) ?? 0)) t.unread++;
  }
  return [...by.values()].sort((a, b) => ts(b.lastAt) - ts(a.lastAt));
}

async function workspaceOf(businessId: number) {
  const c = await db.selectFrom("smsConnection").select(["workspaceId"]).where("businessId", "=", businessId).executeTakeFirst();
  if (!c) throw new InboxNotReady("Connect SMS Gateway in Settings → Integrations to see and reply to client texts here.");
  if (!c.workspaceId) throw new InboxNotReady("Choose the SMS Gateway workspace in Settings → Integrations to see client texts here.");
  return Number(c.workspaceId);
}

export class InboxNotReady extends Error {}

/** Recent messages from the gateway, newest first (up to `pages` × 100). */
export async function fetchMessages(businessId: number, opts: { phone?: string; pages?: number } = {}): Promise<GatewayMessage[]> {
  const ws = await workspaceOf(businessId);
  const out: GatewayMessage[] = [];
  for (let page = 1; page <= (opts.pages ?? 2); page++) {
    const qs = new URLSearchParams({ workspace_id: String(ws), limit: "100", page: String(page), sort: "created_at_desc" });
    if (opts.phone) qs.set("phone", opts.phone);
    const r = await smsApi<{ data?: { messages?: GatewayMessage[]; total?: number } }>(businessId, `/mycrmsim/messages?${qs}`);
    const rows = r.data?.messages ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

/** Client records by normalised phone number. */
export async function clientsByPhone(businessId: number) {
  const rows = await db.selectFrom("clients").select(["id", "name", "phone"]).where("businessId", "=", businessId).where("phone", "!=", "").execute();
  const map = new Map<string, { id: number; name: string }>();
  for (const r of rows) {
    const p = toE164(r.phone ?? "");
    if (p && !map.has(p)) map.set(p, { id: r.id, name: r.name });
  }
  return map;
}

export async function readMarks(businessId: number) {
  const rows = await db.selectFrom("inboxReads").select(["phone", "readAt"]).where("businessId", "=", businessId).execute();
  return new Map(rows.map((r) => [r.phone, new Date(r.readAt).getTime()]));
}

export async function markRead(businessId: number, phone: string) {
  await db
    .insertInto("inboxReads")
    .values({ businessId, phone, readAt: new Date() })
    .onConflict((oc) => oc.columns(["businessId", "phone"]).doUpdateSet({ readAt: new Date() }))
    .execute();
}

// The thread list is polled for the unread badge; keep the gateway calls down.
const cache = new Map<number, { at: number; threads: InboxThread[] }>();
const TTL = 20_000;

export async function listThreads(businessId: number, opts: { fresh?: boolean } = {}) {
  const hit = cache.get(businessId);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL) {
    // Read marks change locally; re-apply them to the cached list.
    const reads = await readMarks(businessId);
    return hit.threads.map((t) => (t.unread && (reads.get(t.phone) ?? 0) >= ts(t.lastAt) ? { ...t, unread: 0 } : t));
  }
  const [msgs, reads, clients] = await Promise.all([fetchMessages(businessId), readMarks(businessId), clientsByPhone(businessId)]);
  const threads = groupThreads(msgs, reads, clients);
  cache.set(businessId, { at: Date.now(), threads });
  return threads;
}

export const forgetThreads = (businessId: number) => cache.delete(businessId);
