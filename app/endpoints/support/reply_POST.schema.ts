import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// The business replies on its request (reopens it if it was solved).
export const schema = z.object({ ticketId: z.number().int().positive(), body: z.string().trim().min(1, "Type a message").max(5000), origin: z.string().url().optional() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postSupportReply = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/support/reply`, {
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
