// Browser-only. Turns the error Supabase Auth appends after a failed Google sign-in
// (?error=…&error_description=… or the same in the #hash) into a message people can act on.
export function readOAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = q.get("error") ?? h.get("error");
  if (!code) return null;
  const desc = (q.get("error_description") ?? h.get("error_description") ?? "").toLowerCase();
  if (code === "access_denied") return "Google sign-in was cancelled.";
  if (desc.includes("exchange external code") || code === "server_error")
    return "Google sign-in isn't working right now. Please sign in with your email and password, or try again shortly.";
  if (desc.includes("signups not allowed") || desc.includes("signup")) return "There's no account for that Google login yet. Create an account first.";
  if (desc.includes("email") && desc.includes("confirm")) return "Please confirm your email address first. Check your inbox for the link.";
  return "Google sign-in didn't complete. Please try again, or sign in with your email and password.";
}
