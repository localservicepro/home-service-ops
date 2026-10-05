import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

const str = (max = 200) => z.string().trim().max(max);

export const schema = z.object({
  owner: z.object({ first: str(80), last: str(80), role: str(80), email: str(), phone: str(50) }).optional(),
  business: z
    .object({ name: str(), abn: str(40), phone: str(50), email: str(), address: str(300), website: str(), area: str(300) })
    .optional(),
  accept: z.object({ cash: z.boolean(), online: z.boolean(), bank: z.boolean() }).optional(),
  bankInfo: z.object({ name: str(), bank: str(), bsb: str(20), acct: str(40) }).optional(),
  cardProvider: z.enum(["stripe", "square"]).optional(),
  directDebit: z.boolean().optional(),
  reviewRequestsEnabled: z.boolean().optional(),
  reviewTrigger: z.enum(["done", "paid"]).optional(),
  reviewDelayMinutes: z.number().int().min(0).max(10080).optional(),
  reviewMessage: z.string().trim().max(600).nullable().optional(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postSettingsSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/settings/save`, {
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
