import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Office: driving minutes and km between every pair of points, so the route planner orders stops
// by real road times. min/km are null when no routing service answered.
export const schema = z.object({ points: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(2).max(100) });
export type InputType = z.infer<typeof schema>;
export type OutputType = { min: (number | null)[][] | null; km: (number | null)[][] | null };

export const postDispatchMatrix = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/dispatch/matrix`, {
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
