import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// origin = the app's own origin in the browser; the redirect URI is derived from it
// so the same code works in the preview and on the published domain.
export const schema = z.object({
  origin: z.string().url().refine((u) => /^https:\/\/[^/]+$/.test(u) || /^http:\/\/localhost(:\d+)?$/.test(u), "Invalid origin"),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { authorizeUrl: string; redirectUri: string };

export const postGcalAuthorize = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/gcal/authorize`, {
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
