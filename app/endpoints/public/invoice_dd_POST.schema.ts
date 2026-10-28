import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Public (invoice link): pay by direct debit. Returns the GoCardless set-up page for new
// customers, charges an existing direct debit, or (check) re-reads the status.
export const schema = z.object({ token: z.string().min(20).max(80), check: z.boolean().optional() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { status: "none" | "setup_sent" | "pending" | "paid" | "failed"; url: string | null };

export const postInvoiceDd = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/public/invoice_dd`, {
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
