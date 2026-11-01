import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Opens a support request (emails the support inbox).
export const schema = z.object({
  subject: z.string().trim().min(3, "Add a short subject").max(140),
  body: z.string().trim().min(5, "Tell us what's happening").max(5000),
  category: z.enum(["quotes", "jobs", "invoices", "clients", "crew", "integrations", "billing", "app", "other"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  origin: z.string().url().optional(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number };

export const postSupportCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/support/create`, {
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
