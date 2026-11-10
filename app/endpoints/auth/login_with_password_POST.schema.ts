import { z } from "zod";
import type { User } from "../../helpers/User";
import { supabase } from "../../helpers/supabaseClient";
import { getSession } from "./session_GET.schema";

// Browser-only: Supabase Auth email + password sign-in, then the app profile.
export const schema = z.object({
  email: z.string().email("Email is required"),
  password: z.string().min(1, "Password is required"),
});

export type OutputType = { user: User };

export const postLogin = async (body: z.infer<typeof schema>): Promise<OutputType> => {
  const input = schema.parse(body);
  const { error } = await supabase.auth.signInWithPassword({ email: input.email.trim().toLowerCase(), password: input.password });
  if (error) {
    if (/confirm/i.test(error.message)) throw new Error("Please confirm your email first — check your inbox for the link we sent.");
    throw new Error(/invalid/i.test(error.message) ? "That email and password don't match." : error.message);
  }
  const s = await getSession();
  if ("error" in s) throw new Error(s.error);
  return s;
};
