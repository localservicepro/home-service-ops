import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff: open a customer's account in the app as its owner, with your own login (see helpers/supportView).
export const schema = z.object({
  businessId: z.number().int().positive(),
  reason: z.string().trim().min(3, "Say why (e.g. ticket #22)").max(300),
  allowChanges: z.boolean().default(false),
  minutes: z.number().int().min(5).max(240).default(60),
});
export type InputType = z.input<typeof schema>;
export type OutputType = { sessionId: string; businessId: number; businessName: string; allowChanges: boolean; expiresAt: Date };

export const postAdminViewAs = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/admin/view_as`, {
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
