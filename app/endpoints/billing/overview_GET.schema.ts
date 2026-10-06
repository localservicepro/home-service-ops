import { z } from "zod";
import superjson from "superjson";
import type { BillingOverview } from "../../helpers/billing";
import { apiFetch } from "../../helpers/apiFetch";

// Owner only: card on file, billing details, invoices and the next charge.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = BillingOverview;

export const getBillingOverview = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/billing/overview`, {
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
