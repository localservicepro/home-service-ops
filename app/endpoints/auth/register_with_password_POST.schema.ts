import { z } from "zod";
import type { User } from "../../helpers/User";
import { APP_URL, supabase } from "../../helpers/supabaseClient";
import { getSession } from "./session_GET.schema";

// Browser-only. Sign up with Supabase Auth. With inviteToken: join that business in the invited
// role. Without it: create a new business (businessName required) and become its owner. The
// business link is made by the api on first sign-in, from the sign-up metadata.
export const schema = z
  .object({
    email: z.string().email("Email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    displayName: z.string().min(1, "Name is required"),
    businessName: z.string().trim().max(120).optional(),
    inviteToken: z.string().max(100).optional(),
  })
  .refine((v) => !!v.inviteToken || !!v.businessName, { message: "Business name is required", path: ["businessName"] });

export type OutputType = { user: User };

/** Thrown when the project requires email confirmation: the account exists but has no session yet. */
export class ConfirmEmailError extends Error {
  constructor(public email: string) {
    super(`We've sent a confirmation link to ${email}. Tap it to finish creating your account.`);
    this.name = "ConfirmEmailError";
  }
}

export const postRegister = async (body: z.infer<typeof schema>): Promise<OutputType> => {
  const input = schema.parse(body);
  const email = input.email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: `${APP_URL}/`,
      data: {
        display_name: input.displayName.trim(),
        ...(input.inviteToken ? { invite_token: input.inviteToken } : { business_name: input.businessName?.trim() }),
      },
    },
  });
  if (error) {
    throw new Error(/registered|exists/i.test(error.message) ? "That email already has an account. Sign in instead, or use a different email." : error.message);
  }
  if (!data.session) throw new ConfirmEmailError(email);
  const s = await getSession();
  if ("error" in s) throw new Error(s.error);
  return s;
};
