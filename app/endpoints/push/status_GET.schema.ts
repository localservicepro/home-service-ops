import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { PushPrefs } from "../../helpers/push";

// Push notification setup for the signed-in person.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { configured: boolean; devices: number; prefs: PushPrefs };

export const getPushStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/push/status`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
