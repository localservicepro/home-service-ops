import { z } from "zod";

// Google redirects the popup here; the handler returns a small HTML page, not JSON.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = string;
