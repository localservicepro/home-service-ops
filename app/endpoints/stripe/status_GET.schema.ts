import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  webhook: boolean;
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  livemode: boolean;
  connectedAt: Date | null;
};

export const getStripeStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/stripe/status`, {
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
