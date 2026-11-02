import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff: load or remove the demo customers (never sent to Sales Brain, no real emails).
export const schema = z.object({ action: z.enum(["load", "clear"]) });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; message: string };

export const postAdminDemo = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/admin/demo`, {
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
