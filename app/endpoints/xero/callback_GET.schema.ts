import { z } from "zod";

// Xero redirects here after the owner approves access; returns a small popup page.
export const schema = z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() });
export type InputType = z.infer<typeof schema>;
export type OutputType = string;
