import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { AdminCustomerDetail } from "../../helpers/adminShared";

// Staff: one business in full: details, team, billing, usage, tickets and notes.
export const schema = z.object({ id: z.number().int().positive() });
export type InputType = z.infer<typeof schema>;
export type OutputType = AdminCustomerDetail;

export const getAdminCustomer = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/admin/customer?${new URLSearchParams({ id: String(p.id) })}`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
