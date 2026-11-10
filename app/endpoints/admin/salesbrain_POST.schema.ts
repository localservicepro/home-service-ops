import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff: test the Sales Brain connection, send now, resend held/rejected events, or backfill.
export const schema = z.object({ action: z.enum(["test", "send", "resend", "backfill"]) });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: boolean; message: string };

export const postAdminSalesBrain = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/admin/salesbrain`, {
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
