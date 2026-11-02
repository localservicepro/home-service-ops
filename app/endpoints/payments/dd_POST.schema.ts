import { z } from "zod";
import superjson from "superjson";
import type { DdState } from "../../helpers/goCardless";
import { apiFetch } from "../../helpers/apiFetch";

// GoCardless direct debit for a job: "start" charges the client's direct debit or returns
// the set-up page link; "status" returns the stored state; "sync" re-checks with GoCardless.
export const schema = z.object({ jobId: z.number().int(), action: z.enum(["start", "status", "sync"]) });
export type InputType = z.infer<typeof schema>;
export type OutputType = DdState;

export const postPayDd = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/payments/dd`, {
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
