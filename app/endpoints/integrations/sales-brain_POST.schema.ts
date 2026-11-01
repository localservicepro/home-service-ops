import { z } from "zod";
import type { EventResult } from "../../helpers/salesBrainInbound";

// Called by Sales Brain, signed with LSP_APP_SHARED_SECRET; not by the app. Plain JSON in and out.
// Body: { "events": [ { "id", "type": "account.provision" | "account.access_ended", "data" } ] }
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { results: EventResult[]; error?: string };
