import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Field crew work timer: start the clock, or finish the job (stops the clock).
export const schema = z.object({
  id: z.number().int(),
  action: z.enum(["start", "finish"]),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postJobsWork = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/jobs/work`, {
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
