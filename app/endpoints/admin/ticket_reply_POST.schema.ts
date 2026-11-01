import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff reply (emails the customer; waits on the customer unless a status is given), or an internal note (internal: true) the customer never sees.
export const schema = z.object({ ticketId: z.number().int().positive(), body: z.string().trim().min(1, "Type a reply").max(5000), status: z.enum(["open", "pending", "solved", "closed"]).optional(), origin: z.string().url().optional(), internal: z.boolean().default(false) });
export type InputType = z.input<typeof schema>;
export type OutputType = { ok: true };

export const postAdminTicketReply = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/admin/ticket_reply`, {
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
