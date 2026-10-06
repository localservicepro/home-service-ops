import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Card pay-now link for a job via the business's chosen card provider (Stripe or Square).
export const schema = z.object({ jobId: z.number().int() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { url: string; amount: number; reused: boolean; provider: "stripe" | "square" };

export const postPayLink = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/payments/link`, {
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
