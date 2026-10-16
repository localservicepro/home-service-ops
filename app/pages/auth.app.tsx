import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Smartphone, AlertCircle } from "lucide-react";
import { APP_SCHEME } from "../helpers/nativeApp";
import styles from "./done.module.css";
import own from "./auth.app.module.css";

// Google sign-in for the Android app runs in the phone's browser (Google blocks app web views).
// Vercel redirects /auth/app straight to the app's URL scheme (vercel.json), which Chrome follows
// without a tap. This page is the fallback: where that redirect doesn't run, it tries the
// scheme itself and offers a button, since browsers may want a tap before opening an app.
export default function AuthAppReturnPage() {
  const search = window.location.search;
  const params = new URLSearchParams(search);
  const failed = !params.get("code") && (params.get("error") || new URLSearchParams(window.location.hash.slice(1)).get("error"));
  const appUrl = `${APP_SCHEME}://auth/callback${search}${window.location.hash}`;

  useEffect(() => {
    window.location.href = appUrl;
  }, [appUrl]);

  return (
    <div className={styles.page}>
      <Helmet><title>Back to the app · Home Service Ops</title></Helmet>
      <div className={styles.card}>
        <span className={failed ? styles.errIcon : styles.okIcon}>{failed ? <AlertCircle size={26} /> : <Smartphone size={26} />}</span>
        <h1>{failed ? "Google sign-in didn't finish" : "Signing you in to the app"}</h1>
        <p>{failed ? "Go back to the Home Service Ops app to try again." : "If the app doesn't open by itself, tap the button below."}</p>
        <a className={own.btn} href={appUrl}>Open Home Service Ops</a>
      </div>
    </div>
  );
}
