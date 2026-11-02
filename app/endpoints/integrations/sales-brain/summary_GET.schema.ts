import { z } from "zod";
import type { SalesBrainSummary } from "../../../helpers/salesBrainSummary";

// Called by Sales Brain (signed with LSP_APP_SHARED_SECRET), not by the app. Plain JSON out.
// Query: ?days=30 (1 to 365) and ?include_demo=1.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = SalesBrainSummary | { error: string };
