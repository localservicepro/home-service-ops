import { z } from "zod";
import superjson from "superjson";
import type { LeadFormConfig } from "../../helpers/leadFormConfig";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = {
  key: string;
  enabled: boolean;
  notifyEmail: boolean;
  submissions: number;
  lastSubmissionAt: Date | null;
  config: LeadFormConfig;
  appUrl: string;
  /** Base URL of the api function (serves the embed script). */
  apiUrl: string;
};

export const getLeadForm = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/leadform/get`, {
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
