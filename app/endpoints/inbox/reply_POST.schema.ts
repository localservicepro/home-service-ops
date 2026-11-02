import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Texts a reply from the business's SMS Gateway number.
export const schema = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/),
  message: z.string().trim().min(1, "Type a message").max(1500),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; messageId: string | null };

export const postInboxReply = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/inbox/reply`, {
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
