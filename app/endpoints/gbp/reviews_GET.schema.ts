import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Office: the business's Google reviews (signed-in listings), newest first.
export const schema = z.object({
  filter: z.enum(["all", "unreplied", "low"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
});
export type InputType = z.input<typeof schema>;
export type Review = {
  reviewId: string;
  stars: number;
  comment: string;
  reviewerName: string;
  reviewerPhoto: string | null;
  createdAt: Date;
  reply: string | null;
  repliedAt: Date | null;
  client: { id: number; name: string } | null;
};
export type OutputType = {
  reviews: Review[];
  counts: { all: number; unreplied: number; low: number };
  /** Suggested replies are signed with this. */
  businessName: string;
  more: boolean;
};

export const getGbpReviews = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const q = new URLSearchParams(Object.entries(schema.parse(params)).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  const result = await apiFetch(`/gbp/reviews?${q}`, { method: "GET", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
