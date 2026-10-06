import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({
  key: z.string().max(60),
  contentType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif|gif)$/, "Photos must be JPEG, PNG, WebP, HEIC or GIF"),
  sizeBytes: z.number().int().min(1).max(15 * 1024 * 1024, "Each photo must be under 15 MB"),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { presignedUrl: string; url: string };

export const postLeadUpload = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/public/lead_upload`, {
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
