import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  connected: boolean;
  name: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number;
  mapsUrl: string | null;
  reviewUrl: string | null;
  /** Review requests sent in the last 30 days. */
  sent30d: number;
  review: { enabled: boolean; trigger: "done" | "paid"; delayMinutes: number; message: string; defaultMessage: string };
};

export const getGbpStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/gbp/status`, {
    method: "GET",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
