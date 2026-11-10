import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { supabase } from "../helpers/supabaseClient";
import { saveReturnTo } from "../helpers/returnTo";
import { AuthLoadingState } from "../components/AuthLoadingState";

// Opened from the Android app ("Manage plan on the web"): signs the same person in on the
// website with a single-use link, then goes to the page they asked for.
const safeNext = (raw: string | null) => (raw && /^\/(?!\/)/.test(raw) ? raw : "/");

export default function GoPage() {
  const { token = "" } = useParams();
  const [title, setTitle] = useState("Signing you in");

  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    (async () => {
      const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
      if (error) {
        // Used or expired: fine if this browser is already signed in, otherwise sign in first.
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          saveReturnTo(next);
          setTitle("This link has expired");
          window.location.replace("/login");
          return;
        }
      }
      window.location.replace(next);
    })();
  }, [token]);

  return (
    <>
      <Helmet>
        <title>Signing in · Home Service Ops</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <AuthLoadingState title={title} />
    </>
  );
}
