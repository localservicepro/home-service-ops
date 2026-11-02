import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Ask Stripe whether a job's pay-now link has been paid (marks the job Paid if so).
export const schema = z.object({ jobId: z.number().int() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { paid: boolean; justPaid: boolean };

export const postStripeCheck = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/stripe/check`, {
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
