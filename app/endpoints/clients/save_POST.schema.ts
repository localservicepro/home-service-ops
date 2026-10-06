import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: z.string().trim().max(50).default(""),
  email: z.string().trim().max(200).default(""),
  addresses: z.array(z.string().trim().min(1).max(300)).max(200),
});
export type InputType = z.input<typeof schema>;
export type OutputType = { id: number };

export const postClientsSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/clients/save`, {
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
