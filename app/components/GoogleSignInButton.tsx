import { useState } from "react";
import { startGoogle } from "../endpoints/auth/google/start_GET.schema";
import styles from "./GoogleSignInButton.module.css";

const isNative = () =>
  typeof window !== "undefined" && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

// "Continue with Google" — a full-page hop to Google and back. Google blocks sign-in inside
// embedded app web views, so the installed mobile app keeps email + password only.
export function GoogleSignInButton({
  mode,
  invite,
  label,
  className,
}: {
  mode: "signin" | "signup";
  invite?: string;
  label?: string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  if (isNative()) return null;
  const go = () => {
    setError(null);
    startGoogle({ mode, invite }).catch((e) => setError(e instanceof Error ? e.message : "Google sign-in isn't available right now."));
  };
  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <button type="button" className={styles.btn} onClick={go}>
        {label ?? "Continue with Google"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.or}>
        <span>or {mode === "signin" ? "sign in" : "sign up"} with email</span>
      </div>
    </div>
  );
}
