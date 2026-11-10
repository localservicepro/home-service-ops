import { z } from "zod";

// Xero → app. Raw body is HMAC-verified (x-xero-signature) before parsing.
export const schema = z.object({
  events: z.array(z.object({ resourceId: z.string(), tenantId: z.string(), eventCategory: z.string(), eventType: z.string() }).passthrough()),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = "";
