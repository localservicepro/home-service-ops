import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  timeZone: string | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  linkedJobs: number;
};

export const getGcalStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/gcal/status`, {
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
