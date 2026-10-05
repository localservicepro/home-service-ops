import { z } from "zod";
import { supabase } from "../../../helpers/supabaseClient";
import { PENDING_SIGNUP_KEY, type PendingSignup } from "../session_GET.schema";

// Browser-only. "Continue with Google" via Supabase Auth (Google provider).
export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type OutputType = void;

export async function startGoogle(opts: { mode: "signin" | "signup"; invite?: string; business?: string }) {
  const pending: PendingSignup = { mode: opts.mode, inviteToken: opts.invite, businessName: opts.business };
  try {
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending));
  } catch {
    /* private mode: the api falls back to sign-in only */
  }
  const back = opts.invite ? `/join/${opts.invite}` : "/login";
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${back}` } });
  if (error) throw new Error(error.message);
}
