import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Owner only: start "Connect with Square" (returns the Square sign-in URL) or disconnect.
export const schema = z.object({ action: z.enum(["authorize", "disconnect"]) });
export type InputType = z.infer<typeof schema>;
export type OutputType = { authorizeUrl?: string; ok: true };

export const postSquareConnect = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/square/connect`, {
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
