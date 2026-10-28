import { z } from "zod";

// Called by Stripe (events on the LSP platform account: subscriptions), not by the app.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { received: true; result: string };
