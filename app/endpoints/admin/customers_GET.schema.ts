import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { AdminCustomer } from "../../helpers/adminShared";

// Staff: every business with its status, plan, revenue and usage.
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { customers: AdminCustomer[] };

export const getAdminCustomers = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/admin/customers`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
