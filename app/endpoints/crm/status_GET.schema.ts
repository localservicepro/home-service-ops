import { z } from "zod";
import superjson from "superjson";
import type { StageMap } from "../../helpers/lcStages";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  configured: boolean;
  connected: boolean;
  locationId: string | null;
  locationName: string | null;
  connectedAt: Date | null;
  pipelineId: string | null;
  stageMap: StageMap;
  importLeads: boolean;
  pushNew: boolean;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  linkedLeads: number;
  planAllows: boolean;
};

export const getCrmStatus = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/crm/status`, {
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
