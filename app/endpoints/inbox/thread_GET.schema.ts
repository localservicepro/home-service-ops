import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { InboxMessage } from "../../helpers/inbox";

// One conversation, oldest first, with the client it belongs to (if any).
export const schema = z.object({ phone: z.string().regex(/^\+\d{8,15}$/, "Not a phone number") });
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  phone: string;
  client: { id: number; name: string; email: string } | null;
  messages: InboxMessage[];
};

export const getInboxThread = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/inbox/thread?${new URLSearchParams({ phone: p.phone })}`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
