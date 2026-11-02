import { z } from "zod";
import superjson from "superjson";
import { DutyStatusArrayValues, RateTypeArrayValues } from "../../helpers/schema";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  role: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(50).optional(),
  duty: z.enum(DutyStatusArrayValues).optional(),
  rateType: z.enum(RateTypeArrayValues),
  rate: z.number().min(0).max(100_000),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number };

export const postCrewSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/crew/save`, {
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
