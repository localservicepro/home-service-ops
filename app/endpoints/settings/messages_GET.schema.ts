import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { MessagePrefs } from "../../helpers/messagePrefsShared";

// How quotes, invoices and review requests are sent (Email / SMS / Both).
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { prefs: MessagePrefs; smsReady: boolean; smsConnected: boolean };

export const getMessageSettings = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/settings/messages`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
