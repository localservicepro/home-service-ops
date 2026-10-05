import { z } from "zod";
import superjson from "superjson";
import type { PublicDoc } from "../../helpers/publicDocs";
import { apiFetch } from "../../helpers/apiFetch";

// Public (no login): a customer's quote or invoice by its secret link token.
export const schema = z.object({ kind: z.enum(["quote", "invoice"]), token: z.string().min(20).max(80) });
export type InputType = z.infer<typeof schema>;
export type OutputType = PublicDoc;

export const getPublicDoc = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/public/doc?kind=${p.kind}&token=${encodeURIComponent(p.token)}`, {
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
