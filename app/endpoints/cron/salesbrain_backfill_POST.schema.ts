import { z } from "zod";

// One-off Sales Brain backfill, runnable from the Supabase SQL editor with the cron key
// (see README). Staff can also run it from /admin.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
type Count = { queued: number; total: number };
export type OutputType = { ok: true; accounts: Count; payments: Count; tickets: Count; errors: string[] };
