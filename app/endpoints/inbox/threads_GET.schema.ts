import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { InboxThread } from "../../helpers/inbox";

// Team inbox: one conversation per phone number (SMS Gateway), newest first.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ready: boolean; reason: string | null; threads: InboxThread[]; unread: number };

export const getInboxThreads = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/inbox/threads`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
