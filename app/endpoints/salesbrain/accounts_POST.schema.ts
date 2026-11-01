import { z } from "zod";

// Called by Sales Brain (signed with LSP_APP_SHARED_SECRET), not by the app. Plain JSON in and out;
// the request shape is in helpers/salesBrainInbound.tsx and the README's Sales Brain section.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: boolean; error?: string; status?: string; account_id?: string };
