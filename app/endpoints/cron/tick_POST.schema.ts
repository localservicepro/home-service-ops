import { z } from "zod";

// Called by pg_cron every 15 minutes (see supabase/migrations/*_cron_tick.sql), not by the app.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; businesses: number; reminders: number; reviews: number };
