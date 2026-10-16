import { z } from "zod";
import superjson from "superjson";
import type { PublicLeadForm } from "../../helpers/leadFormConfig";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({ key: z.string() });
export type InputType = z.infer<typeof schema>;
export type OutputType = PublicLeadForm;

export const getPublicLeadForm = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/public/lead_form?key=${encodeURIComponent(params.key)}`, {
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
