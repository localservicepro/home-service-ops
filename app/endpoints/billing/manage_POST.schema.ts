import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

const origin = z.string().url().refine((u) => /^https:\/\/[^/]+$/.test(u) || /^http:\/\/localhost(:\d+)?$/.test(u), "Invalid origin");

// Owner only: change plan, cancel/resume, update billing details, or get a secure card-update link.
export const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change_plan"), plan: z.enum(["solo", "team"]) }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("details"),
    name: z.string().trim().min(1, "Enter a billing name").max(120),
    email: z.string().trim().email("Enter a valid billing email"),
    line1: z.string().trim().max(200),
    city: z.string().trim().max(80),
    state: z.string().trim().max(40),
    postcode: z.string().trim().max(12),
  }),
  z.object({ action: z.literal("card"), origin }),
]);
export type InputType = z.infer<typeof schema>;
export type OutputType = { message?: string; url?: string };

export const postBillingManage = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/billing/manage`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
