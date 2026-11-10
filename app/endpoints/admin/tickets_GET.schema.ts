import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { TicketSummary } from "../../helpers/supportShared";

// Staff: support requests from every business, filtered by status, assignee and a search.
export const schema = z.object({
  status: z.enum(["active", "open", "in_progress", "pending", "solved", "closed", "all"]).default("active"),
  assigned: z.enum(["all", "me", "none"]).default("all"),
  q: z.string().trim().max(100).default(""),
});
export type InputType = z.input<typeof schema>;
export type OutputType = {
  tickets: TicketSummary[];
  counts: Record<string, number>;
  staff: { id: number; displayName: string; email: string }[];
  meId: number;
};

export const getAdminTickets = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/admin/tickets?${new URLSearchParams({ status: p.status, assigned: p.assigned, q: p.q })}`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
