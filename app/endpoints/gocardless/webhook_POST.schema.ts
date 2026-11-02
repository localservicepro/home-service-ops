import { z } from "zod";

// Called by GoCardless (partner app webhook), not by the app. Raw body + Webhook-Signature.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { received: true };
