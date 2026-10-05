import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  webhook: boolean;
  sandbox: boolean;
  connected: boolean;
  name: string | null;
  livemode: boolean;
  connectedAt: Date | null;
  mandates: number;
};

export const getGcStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/gocardless/status`, {
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
