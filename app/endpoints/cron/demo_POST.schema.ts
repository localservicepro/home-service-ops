import { z } from "zod";

// Called with the cron key (not by the app): load or remove the admin's demo data.
export const schema = z.object({ action: z.enum(["load", "clear"]).default("load") });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; customers?: number; tickets?: number; removed?: number };
