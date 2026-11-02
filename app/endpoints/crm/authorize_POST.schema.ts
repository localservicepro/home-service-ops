import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({
  origin: z.string().url().refine((u) => /^https:\/\/[^/]+$/.test(u) || /^http:\/\/localhost(:\d+)?$/.test(u), "Invalid origin"),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { authorizeUrl: string };

export const postCrmAuthorize = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/crm/authorize`, {
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
