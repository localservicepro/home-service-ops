import { z } from "zod";

// Called by Stripe (Connect webhook), not by the app. Raw body + Stripe-Signature header.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { received: true; result: string };
