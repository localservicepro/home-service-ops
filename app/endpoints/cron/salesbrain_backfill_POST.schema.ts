import { z } from "zod";

// One-off Sales Brain backfill, runnable from the Supabase SQL editor with the cron key
// (see README). Staff can also run it from /admin.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; accounts: number; payments: number; tickets: number; errors: string[] };
