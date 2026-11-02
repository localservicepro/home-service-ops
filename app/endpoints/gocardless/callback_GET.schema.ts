import { z } from "zod";

// GoCardless redirects the sign-in popup here; the handler returns a small HTML page.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = string;
