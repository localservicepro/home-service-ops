import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { postForgotPassword } from "../endpoints/auth/forgot_POST.schema";
import { AuthScreen } from "../components/AuthScreen";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import styles from "./forgot.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postForgotPassword({ email: email.trim(), origin: window.location.origin });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Helmet><title>Reset password · Local Service Pro</title></Helmet>
      <AuthScreen title="Forgot your password?" subtitle="Enter your login email and we'll send you a link to choose a new one.">
        {sent ? (
          <p className={styles.done}>If there's an account for <b>{email}</b>, a reset link is on its way. It expires in 1 hour. Check your spam folder if it doesn't arrive.</p>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            {error && <div className={styles.err}>{error}</div>}
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com.au" autoComplete="email" />
            <Button type="submit" size="lg" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send reset link"}</Button>
          </form>
        )}
        <p className={styles.back}><Link to="/login">Back to sign in</Link></p>
      </AuthScreen>
    </>
  );
}
