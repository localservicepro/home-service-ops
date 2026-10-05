import { z } from "zod";
import superjson from "superjson";
import { RateTypeArrayValues } from "../../helpers/schema";
import { apiFetch } from "../../helpers/apiFetch";

// Setup wizard: record the trade and bulk-add starter services and crew.
export const schema = z.object({
  trade: z.string().trim().max(40).optional(),
  services: z
    .array(z.object({ name: z.string().trim().min(1).max(120), price: z.number().min(0).max(100_000), freq: z.string().trim().max(40) }))
    .max(40)
    .optional(),
  crew: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        phone: z.string().trim().max(40).default(""),
        role: z.string().trim().max(60).default("Crew"),
        rateType: z.enum(RateTypeArrayValues).default("hour"),
        rate: z.number().min(0).max(100_000).default(0),
      }),
    )
    .max(30)
    .optional(),
});
export type InputType = z.input<typeof schema>;
export type OutputType = { services: number; crew: number };

export const postOnboardingApply = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/onboarding/apply`, {
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
