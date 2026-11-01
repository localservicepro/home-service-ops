import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Staff: Sales Brain sync status.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  pending: number;
  sent: number;
  rejected: number;
  held: number;
  lastSentAt: Date | null;
  oldestPendingAt: Date | null;
  problems: { id: string; type: string; status: string; attempts: number; lastError: string | null; nextAttemptAt: Date; createdAt: Date }[];
};

export const getAdminSalesBrain = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/admin/salesbrain`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
