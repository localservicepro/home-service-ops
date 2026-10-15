import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Bring in new leads now (force) or if it's been a couple of minutes (auto, on app open).
export const schema = z.object({ force: z.boolean().optional() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { imported: number; skipped: boolean; error?: string };

export const postCrmPull = async (body: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/crm/pull`, {
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
