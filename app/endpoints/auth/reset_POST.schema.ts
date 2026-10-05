import { z } from "zod";
import { supabase } from "../../helpers/supabaseClient";

// Browser-only. token is the recovery token_hash from our reset email (/reset/<token_hash>), or
// "recovery" when Supabase's own email already signed the browser in.
export const schema = z.object({ token: z.string().min(6).max(200), password: z.string().min(8, "Password must be at least 8 characters") });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

const expired = "This reset link has expired or was already used. Ask for a new one.";

export const postResetPassword = async (body: InputType): Promise<OutputType> => {
  const input = schema.parse(body);
  if (input.token !== "recovery") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: input.token, type: "recovery" });
    if (error) throw new Error(expired);
  } else {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error(expired);
  }
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) throw new Error(/same|different/i.test(error.message) ? "Choose a password you haven't used before." : error.message);
  await supabase.auth.signOut();
  return { ok: true };
};
