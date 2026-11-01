import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { TicketDetail, TicketSummary } from "../../helpers/supportShared";

// Staff: support requests from every business.
export const schema = z.object({ status: z.enum(["active", "open", "pending", "solved", "closed", "all"]).default("active") });
export type InputType = z.infer<typeof schema>;
export type OutputType = { tickets: TicketSummary[]; counts: Record<string, number> };

export const getAdminTickets = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/admin/tickets?${new URLSearchParams({ status: p.status })}`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
