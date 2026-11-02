import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Presign an upload for a job photo. The browser PUTs the bytes to presignedUrl,
// then saves `url` onto the job's photos via jobs/save.
export const schema = z.object({
  jobId: z.number().int(),
  contentType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif|gif)$/, "Photos must be JPEG, PNG, WebP, HEIC or GIF"),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024, "Photos must be under 25 MB"),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { presignedUrl: string; url: string };

export const postJobsPhoto = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/jobs/photo`, {
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
