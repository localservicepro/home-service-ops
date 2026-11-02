import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({
  key: z.string().max(60),
  name: z.string().trim().min(1, "Please enter your name").max(200),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(300).optional(),
  serviceIds: z.array(z.number().int()).max(20).optional(),
  notes: z.string().max(3000).optional(),
  photos: z.array(z.string().max(600)).max(5).optional(),
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().optional(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postLeadSubmit = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/public/lead_submit`, {
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
