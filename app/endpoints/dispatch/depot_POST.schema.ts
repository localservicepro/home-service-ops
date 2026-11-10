import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Office: where crews start their day (the yard). Empty = use the business address.
export const schema = z.object({ address: z.string().trim().max(300) });
export type InputType = z.infer<typeof schema>;
export type OutputType = { address: string; lat: number | null; lng: number | null; isBusinessAddress: boolean };

export const postDispatchDepot = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/dispatch/depot`, {
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
