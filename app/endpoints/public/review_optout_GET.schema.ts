import { z } from "zod";

// Opened from the "Unsubscribe" link in review request emails; returns a small HTML page.
export const schema = z.object({ t: z.string() });
export type InputType = z.infer<typeof schema>;
export type OutputType = string;
