import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { GbpLocation } from "../../helpers/gbpParse";

export const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().trim().min(2).max(160) }),
  z.object({ action: z.literal("connect"), placeId: z.string().trim().min(10).max(300) }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("send"), jobId: z.number().int() }),
  z.object({ action: z.literal("optout"), clientId: z.number().int(), optOut: z.boolean() }),
  // Signed in with Google:
  z.object({ action: z.literal("locations") }),
  z.object({ action: z.literal("pick"), locationName: z.string().regex(/^locations\/[0-9]+$/) }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("reply"), reviewId: z.string().min(1).max(300), comment: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("deleteReply"), reviewId: z.string().min(1).max(300) }),
  z.object({
    action: z.literal("post"),
    summary: z.string().trim().min(10).max(1500),
    button: z.enum(["BOOK", "CALL", "LEARN_MORE"]).nullable().optional(),
    url: z.string().trim().url().max(500).nullable().optional(),
  }),
  z.object({ action: z.literal("signout") }),
]);
export type InputType = z.infer<typeof schema>;
export type PlaceHit = { placeId: string; name: string; address: string; rating: number | null; reviewCount: number };
export type OutputType = { ok: true; results?: PlaceHit[]; message?: string; locations?: GbpLocation[] };

export const postGbpManage = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/gbp/manage`, {
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
