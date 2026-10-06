import { apiFetch } from "../../helpers/apiFetch";
import { z } from "zod";
import superjson from "superjson";
import { lineItemSchema } from "../../helpers/lineItemSchema";
import {
  JobStatusArrayValues,
  RateTypeArrayValues,
  PayMethodArrayValues,
  PayStateArrayValues,
} from "../../helpers/schema";

// Create (no id) or patch (id) a job. Only fields present are changed.
export const schema = z.object({
  id: z.number().int().optional(),
  clientId: z.number().int().nullable().optional(),
  customer: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(50).optional(),
  service: z.string().trim().max(300).optional(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  scheduledTime: z.string().trim().max(20).optional(),
  status: z.enum(JobStatusArrayValues).optional(),
  price: z.number().min(0).max(1_000_000).optional(),
  staffId: z.number().int().nullable().optional(),
  freq: z.string().trim().max(40).optional(),
  notes: z.string().max(4000).optional(),
  lines: z.array(lineItemSchema).max(100).optional(),
  discount: z.number().min(0).max(1_000_000).optional(),
  gst: z.boolean().optional(),
  crewPay: z.number().min(0).max(100_000).nullable().optional(),
  crewPayType: z.enum(RateTypeArrayValues).nullable().optional(),
  payMethod: z.enum(PayMethodArrayValues).nullable().optional(),
  payState: z.enum(PayStateArrayValues).nullable().optional(),
  photos: z.array(z.string().max(2000)).max(40).optional(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number; num: string };

export const postJobsSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/jobs/save`, {
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
