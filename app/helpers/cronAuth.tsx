import { sql } from "kysely";
import { db } from "./db";
import { env } from "./serverEnv";

// Server-only. pg_cron calls /cron/* with x-cron-key; the key lives in Supabase Vault
// (hso_cron_key), shared with the cron jobs, so it never has to be copied anywhere.
// CRON_KEY overrides it for local runs.

let cached: { value: string | null; at: number } | null = null;

async function cronKey(): Promise<string | null> {
  const fromEnv = env("CRON_KEY");
  if (fromEnv) return fromEnv;
  // A found key is kept for 10 minutes; a miss only briefly, so a hiccup doesn't lock the cron out.
  if (cached && Date.now() - cached.at < (cached.value ? 10 * 60_000 : 30_000)) return cached.value;
  let value: string | null = null;
  try {
    // Aliased to one word: the db helper camelCases result columns (decrypted_secret → decryptedSecret).
    const r = await sql<{ key: string }>`select decrypted_secret as "key" from vault.decrypted_secrets where name = 'hso_cron_key' limit 1`.execute(db);
    value = r.rows[0]?.key?.trim() || null;
  } catch (e) {
    console.error("cron key lookup failed", e instanceof Error ? e.message : e);
    value = null;
  }
  cached = { value, at: Date.now() };
  return value;
}

const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** null when the request carries the right key, otherwise the 401 to return. */
export async function rejectUnlessCron(request: Request): Promise<Response | null> {
  const key = await cronKey();
  const given = request.headers.get("x-cron-key") ?? "";
  if (key && given && same(key, given)) return null;
  return new Response(JSON.stringify({ error: "Not allowed" }), { status: 401, headers: { "Content-Type": "application/json" } });
}
