import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Convert an accepted/awaiting quote into a scheduled job.
export const schema = z.object({
  quoteId: z.number().int(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date first"),
  scheduledTime: z.string().trim().min(1, "Pick a time").max(20),
  staffId: z.number({ required_error: "Assign a crew member" }).int(),
  freq: z.string().trim().max(40).optional(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { jobId: number; jobNum: string };

export const postQuotesBook = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/quotes/book`, {
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
