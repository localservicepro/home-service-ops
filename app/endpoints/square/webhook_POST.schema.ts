import { z } from "zod";

// Called by Square (app webhook subscription), not by the app. Raw body + signature header.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { received: true; result: string };
