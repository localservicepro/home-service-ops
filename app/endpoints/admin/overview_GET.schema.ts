import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { AdminOverview } from "../../helpers/adminShared";

// Staff: the dashboard's numbers.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = AdminOverview;

export const getAdminOverview = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/admin/overview`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
