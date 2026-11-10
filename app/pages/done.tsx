import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { APP_CONNECT_COOKIE, APP_SCHEME } from "../helpers/nativeApp";
import styles from "./done.module.css";

// Landing page for browser hops through the API: OAuth popups (Stripe, Xero, Google Calendar…),
// Stripe billing returns and email unsubscribe links. In a popup it reports back to the app
// window that opened it, then closes.

type Done = { t: string; m: string; ty: string | null; ok: boolean; x: Record<string, string> | null };

function decode(raw: string | null): Done | null {
  if (!raw) return null;
  try {
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Done;
    return typeof d.t === "string" && typeof d.m === "string" ? d : null;
  } catch {
    return null;
  }
}

export default function DonePage() {
  const done = useMemo(() => decode(new URLSearchParams(window.location.search).get("d")), []);
  const inPopup = typeof window !== "undefined" && !!window.opener;
  // Connected from the Android app's in-app browser tab, and Vercel's redirect back didn't run.
  const fromApp = !inPopup && typeof document !== "undefined" && document.cookie.includes(`${APP_CONNECT_COOKIE}=1`);

  useEffect(() => {
    if (!done?.ty || !window.opener) return;
    try {
      window.opener.postMessage({ type: done.ty, message: done.m, ...(done.x ?? {}) }, window.location.origin);
      const t = setTimeout(() => window.close(), 1000);
      return () => clearTimeout(t);
    } catch {
      /* opener on another origin */
    }
  }, [done]);

  const ok = done?.ok ?? false;
  return (
    <div className={styles.page}>
      <Helmet><title>{done?.t ?? "Done"} · Home Service Ops</title></Helmet>
      <div className={styles.card}>
        <span className={ok ? styles.okIcon : styles.errIcon}>{ok ? <CheckCircle2 size={26} /> : <AlertCircle size={26} />}</span>
        <h1>{done?.t ?? "Link not valid"}</h1>
        <p>{done?.m ?? "This link isn't valid."}</p>
        {inPopup && done?.ty && <p className={styles.hint}>You can close this window.</p>}
        {fromApp && (
          <a className={styles.appBtn} href={`${APP_SCHEME}://done${window.location.search}`}>
            Back to Home Service Ops
          </a>
        )}
      </div>
    </div>
  );
}
