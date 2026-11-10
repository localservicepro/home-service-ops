import { z } from "zod";

// Serves the website embed script (JavaScript) at <API_URL>/embed.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = string;
