import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  connected: boolean;
  installerName: string | null;
  installerEmail: string | null;
  workspaceId: number | null;
  workspaceName: string | null;
  prefs: { docsDefault: "email" | "sms" | "both"; reviews: "email" | "sms" | "both"; ownerAlerts: boolean; ownerPhone: string };
  lastSentAt: Date | null;
  lastError: string | null;
  sent30d: number;
  /** Texts can go out (connected and a workspace chosen). */
  ready: boolean;
};

export const getSmsStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/sms/status`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
