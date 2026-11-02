import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().trim().min(2).max(160) }),
  z.object({ action: z.literal("connect"), placeId: z.string().trim().min(10).max(300) }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("send"), jobId: z.number().int() }),
  z.object({ action: z.literal("optout"), clientId: z.number().int(), optOut: z.boolean() }),
]);
export type InputType = z.infer<typeof schema>;
export type PlaceHit = { placeId: string; name: string; address: string; rating: number | null; reviewCount: number };
export type OutputType = { ok: true; results?: PlaceHit[]; message?: string };

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
