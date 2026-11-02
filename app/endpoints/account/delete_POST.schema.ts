import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Deletes the signed-in login (Google Play requires in-app account deletion). If this person is
// the business owner, the business and all its data go too, and any paid plan is cancelled.
export const schema = z.object({ confirm: z.literal("DELETE") });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; businessesDeleted: number };

export const postAccountDelete = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/account/delete`, {
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
