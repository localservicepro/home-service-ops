import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { ReminderHours } from "../../helpers/remindersShared";

// Job reminder settings: on/off, how far ahead, optional note.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { enabled: boolean; hours: ReminderHours; message: string; smsReady: boolean; upcoming: number };

export const getReminderSettings = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/reminders/settings`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
