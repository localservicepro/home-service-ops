import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// The Android app registers this phone's Firebase token for the signed-in person.
export const schema = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "ios"]).default("android") });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postPushRegister = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/push/register`, {
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
