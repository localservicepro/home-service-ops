import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../helpers/useAuth";
import { supabase } from "../helpers/supabaseClient";
import { AuthLoadingState } from "../components/AuthLoadingState";
import { PENDING_SIGNUP_KEY, type PendingSignup } from "../endpoints/auth/session_GET.schema";

// Where Google sends people back to. Stays on one splash screen while Supabase finishes the sign-in
// and the account loads, then goes straight to the app, so the sign-in form never flashes up.
function pendingInvite(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
    return raw ? ((JSON.parse(raw) as PendingSignup).inviteToken ?? null) : null;
  } catch {
    return null;
  }
}

export default function AuthCallbackPage() {
  const { authState } = useAuth();
  const [failed, setFailed] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const oauthError = params.get("error") ?? hash.get("error");

  useEffect(() => {
    if (oauthError) return;
    // getSession() waits for supabase-js to finish exchanging the ?code= from Google.
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && !data.session) setFailed(true);
    });
    const t = setTimeout(() => alive && setFailed(true), 20_000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [oauthError]);

  if (oauthError || failed) {
    const invite = pendingInvite();
    const qs = new URLSearchParams({ error: oauthError ?? "server_error", error_description: params.get("error_description") ?? hash.get("error_description") ?? "" });
    return <Navigate to={`${invite ? `/join/${invite}` : "/login"}?${qs}`} replace />;
  }
  if (authState.type === "authenticated") return <Navigate to="/" replace />;
  return <AuthLoadingState title="Signing you in with Google" />;
}
