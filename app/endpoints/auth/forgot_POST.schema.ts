import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import { APP_URL, supabase } from "../../helpers/supabaseClient";

// Emails a password reset link. Always answers "ok" so it can't be used to probe emails.
export const schema = z.object({ email: z.string().trim().email("Enter your email"), origin: z.string().url().optional() });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true; fallback?: boolean };

export const postForgotPassword = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/auth/forgot`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  const out = superjson.parse<OutputType>(await result.text());
  // No custom email set up yet: let Supabase Auth send its built-in reset email.
  if (out.fallback) await supabase.auth.resetPasswordForEmail(validatedInput.email, { redirectTo: `${APP_URL}/reset/recovery` });
  return { ok: true };
};
