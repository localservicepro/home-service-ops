import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useAuth } from "../helpers/useAuth";
import { AuthScreen } from "../components/AuthScreen";
import { PasswordLoginForm } from "../components/PasswordLoginForm";
import { SignUpForm } from "../components/SignUpForm";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import styles from "./login.module.css";

export default function LoginPage() {
  const { authState } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin",
  );
  const [googleError] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("error") : null));
  if (authState.type === "authenticated") return <Navigate to="/" replace />;

  return (
    <>
      <Helmet>
        <title>{mode === "signin" ? "Sign in" : "Create account"} · Local Service Pro</title>
      </Helmet>
      <AuthScreen
        title={mode === "signin" ? "Welcome back" : "Start your free trial"}
        subtitle={mode === "signin" ? "Sign in to run today's jobs." : "Quotes, scheduling, crew and payments in one app. Set up takes a few minutes."}
      >
        <div className={styles.tabs} role="tablist">
          <button role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? styles.active : styles.tab} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? styles.active : styles.tab} onClick={() => setMode("signup")}>
            Create account
          </button>
        </div>
        {googleError && <div className={styles.error}>{googleError}</div>}
        <GoogleSignInButton key={mode} mode={mode} label={mode === "signin" ? "Continue with Google" : "Sign up with Google"} />
        {mode === "signin" ? <PasswordLoginForm /> : <SignUpForm />}
        {mode === "signin" && (
          <p className={styles.note}><Link to="/forgot">Forgot your password?</Link></p>
        )}
        <p className={styles.note}>
          {mode === "signin" ? "Crew member? Use the invite link the office sent you to set up your login." : "Joining an existing business? Ask the owner for an invite link instead."}
        </p>
      </AuthScreen>
    </>
  );
}
