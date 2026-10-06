import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({
  quoteId: z.number().int(),
  to: z.string().trim().email("Enter the customer's email"),
  message: z.string().trim().max(1000).optional(),
  origin: z.string().url(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; sentTo: string };

export const postQuotesSend = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/quotes/send`, {
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
