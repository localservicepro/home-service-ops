import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Office: save an optimised day. Each change sets a job's crew member and time (the date stays).
export const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  changes: z
    .array(z.object({ jobId: z.number().int(), staffId: z.number().int().nullable(), time: z.string().trim().max(20) }))
    .min(1)
    .max(300),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { updated: number; reassigned: number; retimed: number };

export const postDispatchApply = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/dispatch/apply`, {
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
