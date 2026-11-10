import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Public: the customer accepts or declines their quote from the quote page.
export const schema = z.object({
  token: z.string().min(20).max(80),
  action: z.enum(["accept", "decline"]),
  reason: z.string().trim().max(500).optional(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { status: "Accepted" | "Declined" };

export const postQuoteRespond = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/public/quote_respond`, {
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
