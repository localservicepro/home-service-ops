import { z } from "zod";

// Stripe Checkout / billing portal send the popup back here; returns a small HTML page.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = string;
