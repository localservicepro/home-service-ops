import { z } from "zod";

// Called by LeadConnector (the marketplace app's webhook), not by the app.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { received: true; result: string };
