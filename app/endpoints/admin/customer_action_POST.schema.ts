import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff: change a customer's access, extend a trial, cancel a subscription, suspend or delete the account, or keep notes.
export const schema = z.object({
  customerId: z.number().int().positive(),
  change: z.discriminatedUnion("action", [
    z.object({ action: z.literal("comp_on"), note: z.string().trim().max(200).optional(), endsAt: z.coerce.date().nullish() }),
    z.object({ action: z.literal("comp_off") }),
    z.object({ action: z.literal("extend_trial"), days: z.number().int().min(1).max(365) }),
    z.object({ action: z.literal("cancel_subscription") }),
    z.object({ action: z.literal("suspend"), reason: z.string().trim().max(300).default(""), cancelSubscription: z.boolean().default(false) }),
    z.object({ action: z.literal("reinstate") }),
    z.object({ action: z.literal("delete"), confirmName: z.string() }),
    z.object({ action: z.literal("note"), body: z.string().trim().min(1, "Write a note").max(5000) }),
    z.object({ action: z.literal("delete_note"), noteId: z.number().int().positive() }),
  ]),
});
export type InputType = z.input<typeof schema>;
export type OutputType = { ok: true; message: string };

export const postAdminCustomerAction = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/admin/customer_action`, {
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
