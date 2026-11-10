import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { RoadProvider, RoadRoute } from "../../helpers/roadRoute";

// Office and crew: road routes through points, for drawing routes on the map and for in-app
// turn-by-turn directions. A point is a position or an address (placed on the map server-side).
const point = z.union([z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), z.object({ address: z.string().trim().min(3).max(300) })]);
export const schema = z.object({
  routes: z.array(z.object({ points: z.array(point).min(2).max(60) })).min(1).max(12),
  /** Other ways to go (only between two points). */
  alternatives: z.boolean().optional(),
  /** Turn-by-turn steps. */
  steps: z.boolean().optional(),
});
export type InputType = z.infer<typeof schema>;
export type RoadPoint = z.infer<typeof point>;
/** One per requested route, in order; null = no road route (an address wasn't found, or no routing service answered). */
export type OutputType = { results: ({ routes: RoadRoute[]; provider: RoadProvider } | null)[] };

export const postDispatchRoads = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/dispatch/roads`, {
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
