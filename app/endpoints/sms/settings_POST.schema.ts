import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({
  workspaceId: z.number().int().positive().nullable(),
  workspaceName: z.string().trim().max(255).nullable(),
  prefs: z.object({
  docsDefault: z.enum(["email", "sms", "both"]),
  reviews: z.enum(["email", "sms", "both"]),
  ownerAlerts: z.boolean(),
  ownerPhone: z.string().trim().max(30),
}),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postSmsSettings = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/sms/settings`, {
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
