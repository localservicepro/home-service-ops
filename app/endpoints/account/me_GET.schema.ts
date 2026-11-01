import { z } from "zod";
import superjson from "superjson";
import type { MemberRole } from "../../helpers/schema";
import type { BillingSummary } from "../../helpers/plans";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  userId: number;
  email: string;
  displayName: string;
  businessId: number;
  businessName: string;
  role: MemberRole;
  staffId: number | null;
  billing: BillingSummary;
  onboarded: boolean;
  trade: string;
  /** Local Service Pro staff: can open /admin. */
  platformAdmin: boolean;
};

export const getAccountMe = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/account/me`, {
    method: "GET",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    const err = new Error(errorObject.error) as Error & { status?: number };
    err.status = result.status;
    throw err;
  }
  return superjson.parse<OutputType>(await result.text());
};
