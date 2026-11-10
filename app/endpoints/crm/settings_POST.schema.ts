import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

const id = z.string().trim().min(1).max(80);
export const schema = z.object({
  pipelineId: id,
  stageMap: z.object({
    new: id,
    quoted: id.optional(),
    booked: id.optional(),
    done: id.optional(),
    paid: id.optional(),
    lost: id.optional(),
  }),
  importLeads: z.boolean(),
  pushNew: z.boolean(),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postCrmSettings = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/crm/settings`, {
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
