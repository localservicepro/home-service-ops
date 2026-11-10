import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { GbpInsights } from "../../helpers/gbpParse";
import type { GbpPost } from "../../helpers/gbpGoogle";

// Office: the signed-in listing's performance (last 30 days against the 30 before) and recent posts.
// Each part is null with a reason when Google didn't give it.
export const schema = z.object({ refresh: z.coerce.boolean().optional() });
export type InputType = z.input<typeof schema>;
export type OutputType = {
  insights: GbpInsights | null;
  insightsError: string | null;
  posts: GbpPost[] | null;
  postsError: string | null;
  website: string | null;
};

export const getGbpProfile = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/gbp/profile${params.refresh ? "?refresh=1" : ""}`, { method: "GET", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
