import { z } from "zod";
import superjson from "superjson";
import { lineItemSchema } from "../../helpers/lineItemSchema";
import { apiFetch } from "../../helpers/apiFetch";

// Create/resend a quote (with customer + lines), or just change its status (id + status).
export const schema = z.object({
  id: z.number().int().optional(),
  clientId: z.number().int().nullable().optional(),
  customer: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().max(4000).optional(),
  lines: z.array(lineItemSchema).min(1, "Add at least one line item").max(100).optional(),
  discount: z.number().min(0).max(1_000_000).optional(),
  gst: z.boolean().optional(),
  status: z.enum(["Awaiting", "Accepted", "Declined"]).optional(),
  declineReason: z.string().trim().max(500).nullable().optional(),
  // New quote for an existing job request: the request moves to "Quote Sent" and is linked.
  fromJobId: z.number().int().optional(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number; num: string };

export const postQuotesSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/quotes/save`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
