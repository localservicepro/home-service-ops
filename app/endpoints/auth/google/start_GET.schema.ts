import { z } from "zod";
import { supabase } from "../../../helpers/supabaseClient";
import { isNativeApp, openInBrowser } from "../../../helpers/nativeApp";
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
  if (isNativeApp()) {
    // Google refuses sign-in inside app web views, so it runs in a Custom Tab. Google returns to
    // /auth/app there, which hands the code back to the app through its URL scheme.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/app`, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw new Error(error?.message ?? "Google sign-in isn't available right now.");
    await openInBrowser(data.url);
    return;
  }
  // Back to one splash page that waits for the session, instead of the sign-in form.
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
  if (error) throw new Error(error.message);
}
