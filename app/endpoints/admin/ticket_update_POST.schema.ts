import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff: change a request's status, priority or assignee (null = unassigned).
export const schema = z.object({ ticketId: z.number().int().positive(), status: z.enum(["open", "in_progress", "pending", "solved", "closed"]).optional(), priority: z.enum(["low", "normal", "high", "urgent"]).optional(), assignedTo: z.number().int().positive().nullable().optional() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postAdminTicketUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/admin/ticket_update`, {
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
