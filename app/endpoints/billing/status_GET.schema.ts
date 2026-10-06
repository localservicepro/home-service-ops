import { z } from "zod";
import superjson from "superjson";
import type { BillingSummary } from "../../helpers/plans";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = BillingSummary & { canManage: boolean; stripeReady: boolean };

export const getBillingStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/billing/status`, {
    method: "GET",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
