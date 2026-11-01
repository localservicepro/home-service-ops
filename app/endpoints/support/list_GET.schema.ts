import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { TicketDetail, TicketSummary } from "../../helpers/supportShared";

// Help & support: this business's requests, newest activity first.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { tickets: TicketSummary[] };

export const getSupportList = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/support/list`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
