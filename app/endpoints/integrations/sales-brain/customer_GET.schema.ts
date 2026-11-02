import { z } from "zod";

// Called by Sales Brain (signed with LSP_APP_SHARED_SECRET), not by the app. Plain JSON out; see customer_GET.ts.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = Record<string, unknown>;
