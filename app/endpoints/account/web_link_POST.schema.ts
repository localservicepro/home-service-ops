import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Android app → website already signed in: a single-use link (/go/<token>, 1 hour) that signs
// the same person in on the web and opens `next`. Used for Plan & billing, which can't be
// bought inside a Play Store app.
export const schema = z.object({
  next: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)[\w\-/?=&.%]*$/, "Must be a path in this app"),
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { url: string };

export const postAccountWebLink = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/account/web_link`, {
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
