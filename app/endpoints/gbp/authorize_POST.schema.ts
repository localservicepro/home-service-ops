import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Office: start "Sign in with Google" for the Business Profile (opens in a popup).
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = { authorizeUrl: string };

export const postGbpAuthorize = async (body: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/gbp/authorize`, {
    method: "POST",
    body: superjson.stringify(schema.parse(body)),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
