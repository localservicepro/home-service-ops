import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Which alerts the signed-in person wants on their phones.
export const schema = z.object({ leads: z.boolean(), quotes: z.boolean(), payments: z.boolean(), jobs: z.boolean() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postPushPrefs = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/push/prefs`, {
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
