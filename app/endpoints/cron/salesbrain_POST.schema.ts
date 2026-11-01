import { z } from "zod";

// Called by pg_cron every minute: sends due Sales Brain events. Not used by the app.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; sent: number; failed: number; skipped?: string };
