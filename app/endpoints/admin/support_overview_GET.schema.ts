import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { SupportOverview } from "../../helpers/adminShared";

// Staff: the support desk at a glance (volume, response times, categories, workload).
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = SupportOverview;

export const getAdminSupportOverview = async (_p: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/admin/support_overview`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
