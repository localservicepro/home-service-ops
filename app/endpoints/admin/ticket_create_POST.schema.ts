import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff: start a conversation with a business (emails the owner).
export const schema = z.object({
  businessId: z.number().int().positive(),
  subject: z.string().trim().min(3, "Add a short subject").max(140),
  body: z.string().trim().min(1, "Write a message").max(5000),
  category: z.enum(["quotes", "jobs", "invoices", "clients", "crew", "integrations", "billing", "app", "other"]).default("other"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  origin: z.string().url().optional(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number };

export const postAdminTicketCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/admin/ticket_create`, {
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
