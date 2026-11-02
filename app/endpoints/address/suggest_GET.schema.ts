import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Australian address suggestions (Google Places Autocomplete, called by the api with its key).
export const schema = z.object({
  q: z.string().trim().min(3).max(200),
  /** Groups one person's keystrokes into a single Google billing session. */
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});
export type InputType = z.infer<typeof schema>;
export type AddressSuggestion = { id: string; main: string; secondary: string; full: string };
export type OutputType = { configured: boolean; suggestions: AddressSuggestion[] };

export const getAddressSuggest = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const qs = new URLSearchParams({ q: p.q, ...(p.session ? { session: p.session } : {}) });
  const result = await apiFetch(`/address/suggest?${qs}`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
