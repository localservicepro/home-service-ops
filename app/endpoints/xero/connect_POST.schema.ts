import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("authorize") }),
  z.object({ action: z.literal("disconnect") }),
  z.object({
    action: z.literal("settings"),
    autoSync: z.boolean().optional(),
    salesAccountCode: z.string().max(20).nullable().optional(),
    bankAccountId: z.string().max(64).nullable().optional(),
    bankAccountName: z.string().max(200).nullable().optional(),
    invoiceMode: z.enum(["paid", "invoice"]).optional(),
    emailInvoices: z.boolean().optional(),
  }),
  z.object({ action: z.literal("push"), jobId: z.number().int() }),
  z.object({ action: z.literal("invoice"), jobId: z.number().int() }),
  z.object({ action: z.literal("check"), jobId: z.number().int() }),
  z.object({ action: z.literal("sync") }),
]);
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; authorizeUrl?: string; status?: string; count?: number; url?: string | null; emailed?: boolean };

export const postXeroConnect = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/xero/connect`, {
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
