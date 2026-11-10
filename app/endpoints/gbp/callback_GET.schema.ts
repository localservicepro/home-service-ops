import { z } from "zod";

// Google redirects the sign-in popup here; the handler sends it on to the app's /done page.
// No app session: the business comes from the stored sign-in state.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = never;
