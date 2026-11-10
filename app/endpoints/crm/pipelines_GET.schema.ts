import { z } from "zod";
import superjson from "superjson";
import type { Pipeline } from "../../helpers/lcSync";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { pipelines: Pipeline[] };

export const getCrmPipelines = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/crm/pipelines`, {
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
