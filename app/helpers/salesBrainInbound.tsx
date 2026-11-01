import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { signPayload } from "./salesBrainEvents";

// Server-only, no I/O: checks requests Sales Brain sends to this app (POST API/salesbrain/accounts).
// Same scheme as our outgoing calls: x-lsp-timestamp (unix seconds) and
// x-lsp-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">, within 5 minutes.

export const MAX_SKEW_S = 300;

export function verifySignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  now = Date.now(),
): { ok: true } | { ok: false; error: string } {
  if (!timestamp || !/^\d{9,11}$/.test(timestamp)) return { ok: false, error: "Missing or invalid x-lsp-timestamp" };
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > MAX_SKEW_S) return { ok: false, error: "Timestamp is more than 5 minutes off" };
  const m = /^sha256=([0-9a-f]{64})$/i.exec(signature?.trim() ?? "");
  if (!m) return { ok: false, error: "Missing or invalid x-lsp-signature" };
  const expected = Buffer.from(signPayload(secret, timestamp, rawBody), "hex");
  const given = Buffer.from(m[1].toLowerCase(), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, error: "Signature doesn't match" };
  return { ok: true };
}

const text = (max: number) => z.string().trim().max(max).optional();

export const provisionSchema = z
  .object({
    action: z.enum(["grant", "revoke"]),
    /** Sales Brain's own id for the customer. Grants are idempotent on it. */
    external_id: z.string().trim().min(1).max(200),
    /** This app's account id, if Sales Brain already knows it (from account.upserted). */
    account_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d+$/)).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    business_name: text(200),
    owner_name: text(200),
    phone: text(40),
    address: text(300),
    website: text(300),
    abn: text(20),
    /** Shown to the customer on Plan & billing, e.g. "Included with your Local Service Pro website plan". */
    note: text(200),
    /** Email the customer (welcome / free access ended). Default true. */
    send_email: z.boolean().default(true),
    /** Revoke only: days they keep full access to choose a plan. Default 14. */
    grace_days: z.number().int().min(0).max(90).default(14),
  })
  .superRefine((v, ctx) => {
    if (v.action === "grant") {
      if (!v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "email is required to grant access" });
      if (!v.business_name) ctx.addIssue({ code: "custom", path: ["business_name"], message: "business_name is required to grant access" });
    }
  });

export type ProvisionRequest = z.infer<typeof provisionSchema>;

/** Parses the body; errors read like "email: email is required to grant access". */
export function parseProvision(raw: string): { ok: true; req: ProvisionRequest } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Body isn't valid JSON" };
  }
  const r = provisionSchema.safeParse(json);
  if (r.success) return { ok: true, req: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") };
}

export const DEFAULT_COMP_NOTE = "Included with your Local Service Pro plan";
