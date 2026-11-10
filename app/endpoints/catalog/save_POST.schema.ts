import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Services and add-ons. A service can declare which add-ons apply to it (addonIds),
// and an add-on can declare which services it applies to (serviceIds) — same link, two sides.
export const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("service"),
    id: z.number().int().optional(),
    name: z.string().trim().min(1, "Name is required").max(200),
    price: z.number().min(0).max(1_000_000),
    freq: z.string().trim().min(1).max(40),
    active: z.boolean(),
    addonIds: z.array(z.number().int()).max(200).optional(),
  }),
  z.object({
    kind: z.literal("addon"),
    id: z.number().int().optional(),
    name: z.string().trim().min(1, "Name is required").max(200),
    price: z.number().min(0).max(1_000_000),
    serviceIds: z.array(z.number().int()).max(200),
  }),
]);
export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number };

export const postCatalogSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/catalog/save`, {
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
