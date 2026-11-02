import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), config: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional(), notifyEmail: z.boolean().optional() }),
  z.object({
    action: z.literal("logo"),
    contentType: z.string().regex(/^image\/(png|jpeg|webp|svg\+xml|gif)$/, "Logo must be PNG, JPG, WebP, SVG or GIF"),
    sizeBytes: z.number().int().min(1).max(3 * 1024 * 1024, "Logo must be under 3 MB"),
  }),
]);
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; presignedUrl?: string; url?: string };

export const postLeadFormSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/leadform/save`, {
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
