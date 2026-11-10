import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  workspaces: { id: number; name: string }[];
  devices: { id: number; channel: string; name: string; health: string; number: string | null; workspaceId: number | null }[];
};

export const getSmsWorkspaces = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/sms/workspaces`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
