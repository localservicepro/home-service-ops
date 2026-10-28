import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../../helpers/db";
import { env } from "../../helpers/serverEnv";
import { processReminders } from "../../helpers/reminders";
import { processReviewRequests } from "../../helpers/reviews";
import type { OutputType } from "./tick_POST.schema";

// The key lives in Supabase Vault (shared with the pg_cron job); CRON_KEY is for local runs.
let cachedKey: { value: string | null; at: number } | null = null;
async function cronKey(): Promise<string | null> {
  const fromEnv = env("CRON_KEY");
  if (fromEnv) return fromEnv;
  if (cachedKey && Date.now() - cachedKey.at < 10 * 60_000) return cachedKey.value;
  let value: string | null = null;
  try {
    const r = await sql<{ decrypted_secret: string }>`select decrypted_secret from vault.decrypted_secrets where name = 'hso_cron_key' limit 1`.execute(db);
    value = r.rows[0]?.decrypted_secret ?? null;
  } catch {
    value = null;
  }
  cachedKey = { value, at: Date.now() };
  return value;
}

const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function handle(request: Request) {
  const key = await cronKey();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!key || !given || !same(key, given)) return new Response(superjson.stringify({ error: "Not allowed" }), { status: 401 });

  const rows = await db
    .selectFrom("settings")
    .select(["businessId", "remindersEnabled", "reviewRequestsEnabled"])
    .where((eb) => eb.or([eb("remindersEnabled", "=", true), eb("reviewRequestsEnabled", "=", true)]))
    .execute();
  let reminders = 0;
  let reviews = 0;
  for (const r of rows) {
    if (r.remindersEnabled) reminders += await processReminders(r.businessId);
    if (r.reviewRequestsEnabled) reviews += await processReviewRequests(r.businessId).catch(() => 0);
  }
  const out: OutputType = { ok: true, businesses: rows.length, reminders, reviews };
  return new Response(superjson.stringify(out));
}
