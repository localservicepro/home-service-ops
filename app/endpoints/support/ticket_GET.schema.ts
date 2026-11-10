import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { TicketDetail, TicketSummary } from "../../helpers/supportShared";

// One request with its conversation.
export const schema = z.object({ id: z.number().int().positive() });
export type InputType = z.infer<typeof schema>;
export type OutputType = TicketDetail;

export const getSupportTicket = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/support/ticket?${new URLSearchParams({ id: String(p.id) })}`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
